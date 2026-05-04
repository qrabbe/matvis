import { describe, expect, it } from 'bun:test';
import {
  extractPurchaseItemLines,
  parseCoopReceiptItems,
} from '../../../src/coop/parse/items';
import { fixture } from '../../helpers';

describe('extractPurchaseItemLines (windowing + quirks)', () => {
  it('takes only the lines between Org.Nr and Total SEK', () => {
    const lines = extractPurchaseItemLines(fixture('simple.txt'));
    expect(lines).toEqual(['EGEN/INGEN PÅSE 0,00', 'PESTO PEPERONICO 32,95']);
  });

  it('drops weighed-unit, spaced "FÖR n KR", and bare-price lines', () => {
    const text = [
      'Org.Nr 1',
      'BANAN 0.652 KG',
      'GURKA 2 FÖR 30 KR',
      '12,50',
      'MJÖLK 15,95',
      'Total SEK 15,95',
    ].join('\n');
    expect(extractPurchaseItemLines(text)).toEqual(['MJÖLK 15,95']);
  });
});

describe('parseCoopReceiptItems (pricing + discounts)', () => {
  it('parses comma prices and flags negative lines as discounts', () => {
    const text = ['Org.Nr 1', 'MJÖLK 15,95', 'Total SEK 15,95'].join('\n');
    expect(parseCoopReceiptItems(text)).toEqual([
      { text: 'MJÖLK 15,95', price: 15.95, isDiscount: false },
    ]);
  });

  it('keeps "N för Xkr" discount lines (no space before kr) as negative items', () => {
    const items = parseCoopReceiptItems(fixture('discounts.txt'));
    const discounts = items.filter((i) => i.isDiscount);
    expect(items).toHaveLength(6);
    expect(discounts).toHaveLength(2);
    expect(items.find((i) => i.text === 'PAN PIZZA 3 för 33kr -2,50')).toEqual({
      text: 'PAN PIZZA 3 för 33kr -2,50',
      price: -2.5,
      isDiscount: true,
    });
    // The 2 discount lines sum to the printed "Erhållna rabatter 5,00".
    const sum = discounts.reduce((a, i) => a + i.price, 0);
    expect(Math.round(sum * 100) / 100).toBe(-5);
  });
});
