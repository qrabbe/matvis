// Keep this file action-only, with no `ctx.db` helpers in it, for the same
// reason `coop/fetch.ts` says so: the fallback if ICA starts refusing the V8
// isolate is a `use node` directive at the top, and that flip is only legal
// while the module exports nothing but actions.
import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { icaProductValidator, parseIcaProduct, type IcaProduct } from './parse';

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

/** A 404 means the id no longer resolves publicly, which is a real outcome and
 * not a failure: about 7% of the crawled range answers this way. It comes back
 * as an absent product so the lane can mark the row skipped rather than retry
 * it forever. */
async function fetchOne(sourceId: string): Promise<IcaProduct | null> {
  const response = await fetch(
    `${PRODUCT_URL}/${encodeURIComponent(sourceId)}`,
    {
      headers: HEADERS,
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `ICA product ${sourceId} failed: ${response.status} ${response.statusText}`,
    );
  }
  return parseIcaProduct(await response.text());
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
 * queue carries `sourceId`. */
export const fetchByProductId = internalAction({
  args: { sourceIds: v.array(v.string()) },
  returns: v.array(
    v.object({
      sourceId: v.string(),
      product: v.union(icaProductValidator, v.null()),
    }),
  ),
  handler: async (_ctx, { sourceIds }) =>
    await mapWithConcurrency(sourceIds, CONCURRENCY, async (sourceId) => ({
      sourceId,
      product: await fetchOne(sourceId),
    })),
});
