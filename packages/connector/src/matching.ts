// Matching (receipt line text → EAN) is the connector's job; enrichment
// (EAN → product name/nutrition/price) is the consumer's. So nothing here talks
// to the catalog. The engine that infers new EANs is still to come. The lookup
// key itself is {@link normalizeItemText} in @matvis/shared, since both sides of
// the map have to agree on it; what is left here is the connector's own
// experiment on top of it.

import { normalizeItemText } from '@matvis/shared';

/** A trailing amount with a Swedish decimal comma or a dot, e.g. "32,95". */
const TRAILING_PRICE = /\s*-?\d+[.,]\d{2}$/;

/** A trailing quantity + unit, e.g. "2 ST" or "0,254 KG". The space before the
 * unit is required: it separates a weighed quantity from a package size printed
 * as part of the name ("MJÖLK 1L"). */
const TRAILING_QUANTITY = /\s*\d+(?:[.,]\d+)?\s+(?:kg|st|l|ml|g)$/;

/** Leading receipt markers: asterisks, bullets, dashes. */
const LEADING_NOISE = /^[\s*•\-]+/;

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
