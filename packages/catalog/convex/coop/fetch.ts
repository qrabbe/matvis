// NOTE: keep this file ACTION-ONLY, with no `ctx.db` helpers in it. Everything
// here is a call to Coop over HTTP; if Coop ever starts rejecting requests from
// the V8 isolate, the fallback is a `'use node';` directive at the top of this
// file, and that flip is only legal while the module exports nothing but
// actions. The queue's own reads and writes live in `../ingest.ts` for that
// reason, and reach these through `ctx.runAction`.
import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { COOP_BATCH_SIZE, SEARCH_HITS_PER_NAME } from '../model/ingest';

/**
 * Coop's by-id endpoint. Despite the name it is a POST whose body is an ARRAY of
 * ids, which is what makes batched discovery affordable: one request resolves
 * ~500 EANs. `store=231400` is the store the whole catalog is priced against.
 */
const BY_ID_URL =
  'https://external.api.coop.se/personalization/search/entities/by-id?api-version=v1&store=231400&groups=CUSTOMER_PRIVATE,CUSTOMER_MEDMERA&direct=false';

/** Free-text search. Returns near-complete product payloads — the same shape as
 * by-id — so a hit can be ingested without a second round trip. */
const SEARCH_URL =
  'https://external.api.coop.se/personalization/search/global?api-version=v1&store=231400';

/**
 * Coop external API subscription key. This is the same key coop.se ships to
 * every browser and it gates the public product API only, but it is Coop's key
 * rather than ours, so it comes from the deployment env var.
 *
 * Read it lazily inside the handler, NOT at module top level: Convex imports
 * every module at push time in an environment where deployment env vars are not
 * injected, so a top-level throw would fail the push even with the var set.
 */
function coopApiKey(): string {
  const key = process.env.COOP_EXTERNAL_API_KEY;
  if (!key) throw new Error('COOP_EXTERNAL_API_KEY env var is not set');
  return key;
}

/**
 * The headers Coop actually requires: the subscription key and a JSON content
 * type. The old repo sent a full browser header set (`User-Agent`, `Sec-Fetch-*`,
 * `Referer`); both endpoints were re-verified against the live API with just
 * these two, so nothing here depends on the V8 runtime forwarding a custom
 * `User-Agent`. `Accept` is along for the ride because it costs nothing.
 */
function requestHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Ocp-Apim-Subscription-Key': coopApiKey(),
  };
}

/** Coop wraps every product response in `results.items`. Anything else is a
 * shape change, and an empty list is a legitimate "found nothing". */
async function readItems(
  response: Response,
  label: string,
): Promise<Record<string, unknown>[]> {
  if (!response.ok) {
    throw new Error(
      `${label} failed: ${response.status} ${response.statusText}`,
    );
  }
  const body = (await response.json()) as {
    results?: { items?: unknown };
  };
  const items = body?.results?.items;
  if (items === undefined) return [];
  if (!Array.isArray(items)) {
    throw new Error(`${label} returned a non-array results.items`);
  }
  // Only EAN-bearing items are useful: the EAN is how a result is matched back
  // to the queue row that asked for it, and it is the key `raw_coop` is on.
  return items.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { ean?: unknown }).ean === 'string',
  );
}

/**
 * Fetch a batch of products by EAN. Coop returns only the ones it knows, in no
 * particular order and with no placeholder for the rest, so the caller matches
 * results back by `ean` and treats the remainder as not stocked.
 *
 * Payloads come back RAW. Sanitizing here would risk one type-drifted product
 * failing the whole batch's return validator; the caller sanitizes per product
 * instead, so a bad row fails alone.
 */
export const fetchByEan = internalAction({
  args: { eans: v.array(v.string()) },
  returns: v.array(v.any()),
  handler: async (_ctx, { eans }) => {
    if (eans.length === 0) return [];
    if (eans.length > COOP_BATCH_SIZE) {
      throw new Error(
        `fetchByEan takes at most ${COOP_BATCH_SIZE} EANs, got ${eans.length}`,
      );
    }
    const response = await fetch(BY_ID_URL, {
      method: 'POST',
      headers: requestHeaders(),
      body: JSON.stringify(eans),
    });
    return await readItems(response, 'Coop by-id');
  },
});

/**
 * Resolve free text to products through Coop's own search, in its relevance
 * order. Used by the queue's name rows; the top hit is what the row records as
 * its resolved EAN, and the rest are ingested as catalog breadth.
 */
export const searchByName = internalAction({
  args: { query: v.string(), take: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (_ctx, { query, take }) => {
    const wanted = Math.max(take ?? SEARCH_HITS_PER_NAME, 1);
    const response = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: requestHeaders(),
      body: JSON.stringify({
        query,
        resultsOptions: { skip: 0, take: wanted, sortBy: [], facets: [] },
        relatedResultsOptions: { skip: 0, take: 0 },
        customData: { consent: false },
      }),
    });
    const items = await readItems(response, 'Coop search');
    return items.slice(0, wanted);
  },
});
