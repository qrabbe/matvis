// Matching (receipt line text → EAN) is the connector's job; enrichment
// (EAN → product name/nutrition/price) is the consumer's. So nothing here talks
// to the catalog. The engine that infers new EANs is still to come. This file
// holds the one piece the lookup table and the matcher must agree on: how a raw
// line is reduced to its lookup key.

/** A trailing amount with a Swedish decimal comma or a dot, e.g. "32,95". */
const TRAILING_PRICE = /\s*-?\d+[.,]\d{2}$/;

/** A trailing quantity + unit, e.g. "2 ST" or "0,254 KG". The space before the
 * unit is required: it separates a weighed quantity from a package size printed
 * as part of the name ("MJÖLK 1L"). */
const TRAILING_QUANTITY = /\s*\d+(?:[.,]\d+)?\s+(?:kg|st|l|ml|g)$/;

/** Leading receipt markers: asterisks, bullets, dashes. */
const LEADING_NOISE = /^[\s*•\-]+/;

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
 * drift apart. See {@link stripQuantitySuffix} for the aggressive cleanup that
 * is intentionally NOT applied yet.
 */
export function normalizeItemText(text: string): string {
  const collapsed = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return collapsed.replace(TRAILING_PRICE, '').trim();
}

/**
 * Strip leading receipt markers and a trailing quantity + unit, e.g.
 * "* BANAN 0,254 KG" → "banan". Pure, and NOT part of {@link normalizeItemText}
 * today: it merges lines that may well be different products, which is only
 * worth it once real receipts show these suffixes causing misses. Kept here,
 * tested, as the first thing to try when the engine starts filling the map.
 */
export function stripQuantitySuffix(text: string): string {
  let out = normalizeItemText(text).replace(LEADING_NOISE, '');
  // A line can end with several of these, so peel until nothing matches.
  let changed = true;
  while (changed) {
    const before = out;
    out = out.replace(TRAILING_QUANTITY, '').replace(TRAILING_PRICE, '');
    changed = out !== before;
  }
  return out.trim();
}
