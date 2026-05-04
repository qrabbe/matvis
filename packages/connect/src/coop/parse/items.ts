import type { LineItem } from '@matvis/shared';

/**
 * Coop receipt item parser
 * Requires newline-separated text.
 */

/** Extract the itemized-body lines between `Org.Nr` and `Total SEK`. */
export function extractPurchaseItemLines(text: string): string[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let started = false;
  const out: string[] = [];
  for (const line of lines) {
    if (!started && line.includes('Org.Nr')) {
      started = true;
      continue;
    }
    if (started && line.includes('Total SEK')) break;
    if (!started) continue;

    if (/\d+\.?\d*\s+(KG|ST|L|ML|G)/.test(line)) continue; // weighed-unit line
    if (/FÖR\s+\d+\s+KR/i.test(line)) continue; // spaced promo line
    if (/^\d+,\d{2}$/.test(line)) continue; // bare price line

    out.push(line);
  }
  return out;
}

/** Parse a single amount token with a Swedish decimal comma, e.g. "32,95". */
function parsePrice(line: string): number {
  const match = line.match(/(-?\d+[.,]\d{2})/);
  if (!match || match[1] === undefined) return 0;
  return parseFloat(match[1].replace(',', '.'));
}

/**
 * Parse the itemized lines into {@link LineItem}s. Discount lines surface as
 * items with a negative `price` and `isDiscount: true`.
 */
export function parseCoopReceiptItems(text: string): LineItem[] {
  return extractPurchaseItemLines(text).map((line) => {
    const price = parsePrice(line);
    return { text: line, price, isDiscount: price < 0 };
  });
}
