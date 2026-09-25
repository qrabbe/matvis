import type { LineItem } from '@matvis/shared';

export interface ExtractedLine {
  text: string;
  quantity?: number;
  unit?: string;
}

/** A weighed or multi-pack line prints its own follow-up line — "x0.782 KG
 * 38,76" under a tomato line, "x5 STK 10,36" under a ramen line — carrying
 * the real quantity and a per-unit reference price. The parent line's own
 * price is already the amount charged, so this is only ever read for
 * quantity + unit; its trailing price is discarded. */
const QUANTITY_LINE =
  /^x(\d+(?:[.,]\d+)?)\s*(KG|STK|ST|ML|CL|DL|L|G)\s+-?\d+[.,]\d{2}$/i;

function normalizeUnit(raw: string): string {
  const upper = raw.toUpperCase();
  return upper === 'STK' ? 'st' : upper.toLowerCase();
}

export function extractPurchaseItemLines(text: string): ExtractedLine[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let started = false;
  const out: ExtractedLine[] = [];
  for (const line of lines) {
    if (!started && line.includes('Org.Nr')) {
      started = true;
      continue;
    }
    if (started && line.includes('Total SEK')) break;
    if (!started) continue;

    const quantityLine = QUANTITY_LINE.exec(line);
    if (quantityLine) {
      const previous = out[out.length - 1];
      if (previous) {
        previous.quantity = parseFloat(quantityLine[1]!.replace(',', '.'));
        previous.unit = normalizeUnit(quantityLine[2]!);
      }
      continue;
    }

    // Defensive fallback for a weighed/unit fragment that doesn't match the
    // "xN UNIT price" shape above — drop it rather than mis-parse it as a
    // priced item, same as before this line was ever attached to anything.
    if (/\d+\.?\d*\s+(KG|ST|L|ML|G)/.test(line)) continue;
    if (/FÖR\s+\d+\s+KR/i.test(line)) continue;
    if (/^\d+,\d{2}$/.test(line)) continue;

    out.push({ text: line });
  }
  return out;
}

function parsePrice(line: string): number {
  const match = line.match(/(-?\d+[.,]\d{2})/);
  if (!match || match[1] === undefined) return 0;
  return parseFloat(match[1].replace(',', '.'));
}

export function parseCoopReceiptItems(text: string): LineItem[] {
  return extractPurchaseItemLines(text).map(
    ({ text: line, quantity, unit }) => {
      const price = parsePrice(line);
      return { text: line, price, isDiscount: price < 0, quantity, unit };
    },
  );
}
