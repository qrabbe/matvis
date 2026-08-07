import { describe, expect, it } from 'bun:test';
import { sanitizeCoopProduct } from '../convex/coop/sanitize';
import { coopProductInformationFields } from '../convex/schemes/coop';

describe('sanitizeCoopProduct', () => {
  it('drops fields Coop added after the schema was derived', () => {
    // The two that actually broke inserts, and are still in every live payload.
    const clean = sanitizeCoopProduct({
      ean: '11210000018',
      name: 'Tabasco Röd',
      displayLowerPrice: false,
      displayWeightPrice: true,
    });
    expect(clean).toEqual({ ean: '11210000018', name: 'Tabasco Röd' });
  });

  it('drops unknown keys at every level, not just the top', () => {
    const clean = sanitizeCoopProduct({
      accreditedTags: [{ code: 'KRAV', description: 'KRAV', invented: 1 }],
    });
    expect(clean.accreditedTags).toEqual([
      { code: 'KRAV', description: 'KRAV' },
    ]);
  });

  it('picks the union branch the value actually fits', () => {
    // `consumerInformationSymbolCodes` is an array in some payloads and a
    // numerically-keyed object in others.
    const symbol = { code: 'A', description: 'B', imageUrl: 'C', priority: 1 };
    expect(
      sanitizeCoopProduct({ consumerInformationSymbolCodes: [symbol] })
        .consumerInformationSymbolCodes,
    ).toEqual([symbol]);
    expect(
      sanitizeCoopProduct({ consumerInformationSymbolCodes: { '0': symbol } })
        .consumerInformationSymbolCodes,
    ).toEqual({ '0': symbol });
  });

  it('drops a field whose shape cannot be an array', () => {
    expect(
      sanitizeCoopProduct({ nutrientLinks: {} }).nutrientLinks,
    ).toBeUndefined();
  });

  it('leaves genuine type drift alone, so it surfaces as a schema change', () => {
    // `packageSize` is declared a number. Coercing it here would hide the drift.
    const clean = sanitizeCoopProduct({ packageSize: '500' });
    expect(clean.packageSize).toBe('500' as unknown as number);
  });

  it('emits nothing outside the declared field set, for a full payload', () => {
    const declared = new Set(Object.keys(coopProductInformationFields));
    const clean = sanitizeCoopProduct({
      ean: '7310865085733',
      name: 'Laktosfri Mellanmjölk',
      salesPriceData: { b2cPrice: 21.5, b2bPrice: 19.2, surprise: 1 },
      nutrientLinks: [{ description: 'Fett', unit: 'Gram', amount: ['1.5'] }],
      displayLowerPrice: false,
      somethingCoopAddsNextYear: { nested: [1, 2, 3] },
    });
    expect(Object.keys(clean).filter((key) => !declared.has(key))).toEqual([]);
    expect(clean.salesPriceData).toEqual({ b2cPrice: 21.5, b2bPrice: 19.2 });
  });
});
