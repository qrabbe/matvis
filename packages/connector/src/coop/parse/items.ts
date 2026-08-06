import type { LineItem } from '@matvis/shared';

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

    if (/\d+\.?\d*\s+(KG|ST|L|ML|G)/.test(line)) continue;
    if (/FÖR\s+\d+\s+KR/i.test(line)) continue;
    if (/^\d+,\d{2}$/.test(line)) continue;

    out.push(line);
  }
  return out;
}

function parsePrice(line: string): number {
  const match = line.match(/(-?\d+[.,]\d{2})/);
  if (!match || match[1] === undefined) return 0;
  return parseFloat(match[1].replace(',', '.'));
}

export function parseCoopReceiptItems(text: string): LineItem[] {
  return extractPurchaseItemLines(text).map((line) => {
    const price = parsePrice(line);
    return { text: line, price, isDiscount: price < 0 };
  });
}
