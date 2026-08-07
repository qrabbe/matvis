// Keep this file action-only, with no `ctx.db` helpers in it. The fallback if
// Coop starts rejecting the V8 isolate is a `use node` directive at the top,
// and that flip is only legal while the module exports nothing but actions.
import { v } from 'convex/values';
import { internalAction } from '../_generated/server';
import { COOP_BATCH_SIZE } from '../model/ingest';

const BY_ID_URL =
  'https://external.api.coop.se/personalization/search/entities/by-id?api-version=v1&store=231400&groups=CUSTOMER_PRIVATE,CUSTOMER_MEDMERA&direct=false';

/** Read lazily inside a handler. Convex imports every module at push time with
 * no deployment env vars, so a top-level throw fails the push. */
function coopApiKey(): string {
  const key = process.env.COOP_EXTERNAL_API_KEY;
  if (!key) throw new Error('COOP_EXTERNAL_API_KEY env var is not set');
  return key;
}

function requestHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Ocp-Apim-Subscription-Key': coopApiKey(),
  };
}

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
  return items.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { ean?: unknown }).ean === 'string',
  );
}

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
