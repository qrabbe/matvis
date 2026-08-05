const TRAILING_PRICE = /\s*-?\d+[.,]\d{2}$/;

/** Must not strip more than the trailing price: every edit here invalidates
 * every row in `itemGtinMap`. */
export function normalizeItemText(text: string): string {
  const collapsed = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return collapsed.replace(TRAILING_PRICE, '').trim();
}
