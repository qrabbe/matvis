// Keep this file action-only, with no `ctx.db` helpers in it, for the same
// reason `coop/fetch.ts` says so: the fallback if ICA starts refusing the V8
// isolate is a `use node` directive at the top, and that flip is only legal
// while the module exports nothing but actions.
import { v, type Infer } from 'convex/values';
import { internalAction } from '../_generated/server';
import { errorText } from '../model/ingest';
import { icaProductValidator, parseIcaProduct } from './parse';

const PRODUCT_URL = 'https://handla.ica.se/produkt';

/** The pages ICA advertises to crawlers in robots.txt, which is why this uses
 * them rather than the ecommerce API. That API carries four more fields but
 * answers five calls before a WAF challenge, so it cannot serve a bulk load. */
const HEADERS: Record<string, string> = {
  'User-Agent': 'matvis-catalog/1.0 (+https://matvis.se)',
  'Accept-Language': 'sv-SE,sv;q=0.9',
};

/** Pages in flight at once. The census script runs at 8 against the same host
 * without complaint, and this stays under it because a Convex action is a
 * shorter leash than a laptop script. */
const CONCURRENCY = 5;

/** Generous against a slow page, well under the action budget: 25 pages at
 * concurrency 5 is five waves, so even the worst case stays inside the limit.
 * `AbortController` rather than `AbortSignal.timeout` because the controller is
 * the older and more certainly present of the two in the V8 isolate, and the
 * timer has to outlive the body read anyway. */
const REQUEST_TIMEOUT_MS = 15_000;

/** The statuses that are a statement about the caller rather than about the
 * page, and so must not be answered with 24 more requests. This is the whole
 * distinction Coop's batch-wide rule was reasoned from; on a fan-out lane it
 * applies to these three and to nothing else. */
const CALLER_WIDE_STATUSES = new Set([401, 403, 429]);

/** Thrown to fail the whole action, past the per-page catch. */
class IcaRefusedCaller extends Error {}

/** One page's outcome. Three arms, not two: a page that did not answer is not
 * the same thing as a page that is not there, and the lane settles them
 * differently. */
const fetchedPageValidator = v.object({
  sourceId: v.string(),
  product: v.union(icaProductValidator, v.null()),
  error: v.optional(v.string()),
});

export type IcaFetchedPage = Infer<typeof fetchedPageValidator>;

/** A 404 means the id no longer resolves publicly, which is a real outcome and
 * not a failure. It comes back as an absent product so the lane can mark the
 * row skipped rather than retry it forever.
 *
 * This arm is defensive rather than hot. The first live run measured zero 404s
 * over 6 825 drained rows and zero over a 607 page sample that included every
 * unlisted id in the census, because the census only records ids that answered
 * when it crawled them. The old note here claimed about 7%, which was a rate
 * over the seed range the crawl started from and never over the range this
 * lane fetches. See DECISIONS.md.
 *
 * Anything else that goes wrong comes back as an error on this page alone. One
 * unparseable page, one 500 or one hung socket is a statement about that
 * product id, and taking the other 24 rows of the batch down with it is what
 * kept the lane pinned on the same poison id run after run. */
async function fetchOne(sourceId: string): Promise<IcaFetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${PRODUCT_URL}/${encodeURIComponent(sourceId)}`,
      {
        headers: HEADERS,
        signal: controller.signal,
      },
    );
    if (response.status === 404) return { sourceId, product: null };
    if (CALLER_WIDE_STATUSES.has(response.status)) {
      throw new IcaRefusedCaller(
        `ICA refused the caller on product ${sourceId}: ${response.status} ${response.statusText}`,
      );
    }
    if (!response.ok) {
      return {
        sourceId,
        product: null,
        error: `ICA product ${sourceId} failed: ${response.status} ${response.statusText}`,
      };
    }
    return { sourceId, product: parseIcaProduct(await response.text()) };
  } catch (error) {
    if (error instanceof IcaRefusedCaller) throw error;
    return {
      sourceId,
      product: null,
      error: `ICA product ${sourceId} failed: ${errorText(error)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency<In, Out>(
  items: In[],
  limit: number,
  run: (item: In) => Promise<Out>,
): Promise<Out[]> {
  const out: Out[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      for (;;) {
        const i = next;
        next += 1;
        if (i >= items.length) return;
        out[i] = await run(items[i]!);
      }
    })(),
  );
  await Promise.all(workers);
  return out;
}

/** One page per product, because ICA publishes no batch endpoint. The caller
 * supplies the ids: an EAN alone cannot address an ICA page, which is why the
 * queue carries `sourceId`.
 *
 * The ids are deduped first. Two `eans` rows may legitimately point at one ICA
 * product, and fetching that page twice in one batch buys nothing. The result
 * is keyed by `sourceId`, so the caller fans the single answer back out to
 * every row that asked for it. */
export const fetchByProductId = internalAction({
  args: { sourceIds: v.array(v.string()) },
  returns: v.array(fetchedPageValidator),
  handler: async (_ctx, { sourceIds }): Promise<IcaFetchedPage[]> =>
    await mapWithConcurrency(
      [...new Set(sourceIds)],
      CONCURRENCY,
      async (sourceId) => await fetchOne(sourceId),
    ),
});
