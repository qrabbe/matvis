import { normalizeItemText } from '@matvis/shared';

const TRAILING_PRICE = /\s*-?\d+[.,]\d{2}$/;

// The space before the unit is required: it separates a weighed quantity from a
// package size printed as part of the name, as in "MJÖLK 1L".
const TRAILING_QUANTITY = /\s*\d+(?:[.,]\d+)?\s+(?:kg|st|l|ml|g)$/;

const LEADING_NOISE = /^[\s*•\-]+/;

/** Deliberately not part of `normalizeItemText`: it merges lines that may well
 * be different products. */
export function stripQuantitySuffix(text: string): string {
  let out = normalizeItemText(text).replace(LEADING_NOISE, '');
  let changed = true;
  while (changed) {
    const before = out;
    out = out.replace(TRAILING_QUANTITY, '').replace(TRAILING_PRICE, '');
    changed = out !== before;
  }
  return out.trim();
}
