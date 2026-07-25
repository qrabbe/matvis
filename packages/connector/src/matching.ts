// Matching (receipt line text → EAN) is the connector's job; enrichment
// (EAN → product name/nutrition/price) is the consumer's. So nothing here talks
// to the catalog. The engine that infers new EANs is still to come. This file
// holds the one piece the lookup table and the matcher must agree on: how a raw
// line is reduced to its lookup key.

/** A trailing amount with a Swedish decimal comma or a dot, e.g. "32,95". */
const TRAILING_PRICE = /\s*-?\d+[.,]\d{2}$/;

/** A trailing quantity + unit, e.g. "2 ST" or "0,254 KG". The space before the
 * unit is required: it separates a weighed quantity from a package size printed
 * as part of the name ("MJÖLK 1L"), which must stay in the key so 1L and 1,5L
 * do not collapse onto one another's EAN. */
const TRAILING_QUANTITY = /\s*\d+(?:[.,]\d+)?\s+(?:kg|st|l|ml|g)$/;

/** Leading receipt markers: line numbers, asterisks, bullets. */
const LEADING_NOISE = /^[\s*•\-]+/;

/**
 * Reduce a raw receipt line to its lookup key: lowercased, whitespace-collapsed,
 * and stripped of the price/quantity noise the store prints after the product
 * name. Pure, and deliberately minimal. Both `itemGtinMap.normalizedText` and
 * the matcher run text through here, so any change to it invalidates the map.
 */
export function normalizeItemText(text: string): string {
  let out = text.toLowerCase().replace(/\s+/g, ' ').trim();
  out = out.replace(LEADING_NOISE, '');
  // A line can end with both, in either order ("pesto 2 st 32,95"), so peel
  // trailing tokens until nothing matches.
  let changed = true;
  while (changed) {
    const before = out;
    out = out.replace(TRAILING_PRICE, '').replace(TRAILING_QUANTITY, '');
    changed = out !== before;
  }
  return out.trim();
}
