// The lookup key a receipt line reduces to. It lives in the contract package
// because both sides of the map agree on it: the connector writes
// `itemGtinMap.normalizedText` with it (see connector/convex/schema.ts) and a
// frontend enumerating the rows that table does not have yet must produce the
// same key, or it silently splits or merges groups the matcher would not.

/** A trailing amount with a Swedish decimal comma or a dot, e.g. "32,95". */
const TRAILING_PRICE = /\s*-?\d+[.,]\d{2}$/;

/**
 * Reduce a raw receipt line to its lookup key: lowercased, whitespace-collapsed,
 * and stripped of the trailing price. Pure.
 *
 * Deliberately minimal. The price is the one token that provably varies between
 * two purchases of the same product, so removing it is required for the map to
 * hit at all. Everything else a line carries — package sizes, quantities,
 * markers — might turn out to distinguish two products, and a key that has
 * already discarded it cannot get it back. Dropping more is a change we can
 * make later once the data says it is safe; keeping more is not, because every
 * edit here invalidates every row in `itemGtinMap`.
 *
 * Both the map writer and the matcher run text through here, so the two cannot
 * drift apart. See `stripQuantitySuffix` in @matvis/connector for the aggressive
 * cleanup that is intentionally NOT applied yet.
 */
export function normalizeItemText(text: string): string {
  const collapsed = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return collapsed.replace(TRAILING_PRICE, '').trim();
}
