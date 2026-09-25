import { describe, expect, it } from 'bun:test';
import {
  extractPurchaseItemLines,
  parseCoopReceiptItems,
} from '../../../src/coop/parse/items';
import { fixture } from '../../helpers';

describe('extractPurchaseItemLines (windowing + quirks)', () => {
  it('takes only the lines between Org.Nr and Total SEK', () => {
    const lines = extractPurchaseItemLines(fixture('simple.txt'));
    expect(lines).toEqual([
      { text: 'EGEN/INGEN PÅSE 0,00' },
      { text: 'PESTO PEPERONICO 32,95' },
    ]);
  });

  it('drops a weighed-unit fragment that has no "xN UNIT price" shape, spaced "FÖR n KR", and bare-price lines', () => {
    const text = [
      'Org.Nr 1',
      'BANAN 0.652 KG',
      'GURKA 2 FÖR 30 KR',
      '12,50',
      'MJÖLK 15,95',
      'Total SEK 15,95',
    ].join('\n');
    expect(extractPurchaseItemLines(text)).toEqual([{ text: 'MJÖLK 15,95' }]);
  });

  it('attaches a real "xN KG price" weight line to the item above it instead of dropping it', () => {
    // Verbatim from a real Coop receipt: the parent line's own price (30,31)
    // is the amount charged; the follow-up's trailing price (38,76) is a
    // per-kg reference rate and is discarded, only quantity + unit are kept.
    const text = [
      'Org.Nr 1',
      'TOMATER KVIST KG SVE 30,31',
      'x0.782 KG 38,76',
      'Total SEK 30,31',
    ].join('\n');
    expect(extractPurchaseItemLines(text)).toEqual([
      { text: 'TOMATER KVIST KG SVE 30,31', quantity: 0.782, unit: 'kg' },
    ]);
  });

  it('attaches a real "xN STK price" multiple line, normalizing STK to st', () => {
    const text = [
      'Org.Nr 1',
      'DEMAE RAMEN KYCKLI 51,80',
      'x5 STK 10,36',
      'Total SEK 51,80',
    ].join('\n');
    expect(extractPurchaseItemLines(text)).toEqual([
      { text: 'DEMAE RAMEN KYCKLI 51,80', quantity: 5, unit: 'st' },
    ]);
  });

  it('leaves a quantity line with no preceding item alone (never throws)', () => {
    const text = ['Org.Nr 1', 'x5 STK 10,36', 'Total SEK 0,00'].join('\n');
    expect(extractPurchaseItemLines(text)).toEqual([]);
  });
});

describe('parseCoopReceiptItems (pricing + discounts)', () => {
  it('parses comma prices and flags negative lines as discounts', () => {
    const text = ['Org.Nr 1', 'MJÖLK 15,95', 'Total SEK 15,95'].join('\n');
    expect(parseCoopReceiptItems(text)).toEqual([
      {
        text: 'MJÖLK 15,95',
        price: 15.95,
        isDiscount: false,
        quantity: undefined,
        unit: undefined,
      },
    ]);
  });

  it('carries quantity and unit through onto the parsed item', () => {
    const text = [
      'Org.Nr 1',
      'GURKA ST 86,88',
      'x4 STK 21,72',
      'Total SEK 86,88',
    ].join('\n');
    expect(parseCoopReceiptItems(text)).toEqual([
      {
        text: 'GURKA ST 86,88',
        price: 86.88,
        isDiscount: false,
        quantity: 4,
        unit: 'st',
      },
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
      quantity: undefined,
      unit: undefined,
    });
    // The 2 discount lines sum to the printed "Erhållna rabatter 5,00".
    const sum = discounts.reduce((a, i) => a + i.price, 0);
    expect(Math.round(sum * 100) / 100).toBe(-5);
  });
});
