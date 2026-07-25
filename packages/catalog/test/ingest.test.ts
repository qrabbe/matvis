import { describe, expect, it } from 'bun:test';
import { eanFromProductUrl, eansFromSitemap } from '../convex/coop/discovery';
import { sanitizeCoopProduct } from '../convex/coop/sanitize';
import { coopProductInformationFields } from '../convex/schemes/coop';

/** Wrap `locs` the way Coop's product sitemap does. */
function sitemap(locs: string[]): string {
  const urls = locs
    .map(
      (loc) =>
        `  <url>\n    <loc>${loc}</loc>\n    <lastmod>2026-05-03T03:31:07.175Z</lastmod>\n  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

const PRODUCT_URL =
  'https://www.coop.se/handla/varor/kryddor-smaksattare/saser-dressing/ovriga-smaksattare/tabasco-rod-11210000018';

describe('eanFromProductUrl', () => {
  it('reads the id off the real id lengths the sitemap carries', () => {
    // 13, 11, 12 and 8 digits all appear in the live sitemap.
    expect(eanFromProductUrl(PRODUCT_URL)).toBe('11210000018');
    expect(
      eanFromProductUrl(
        'https://www.coop.se/handla/varor/fritid/bocker-film/bocker/helix-9789150965520',
      ),
    ).toBe('9789150965520');
    expect(
      eanFromProductUrl(
        'https://www.coop.se/handla/varor/godis-glass-snacks/halstabletter-tuggummi/halstabletter/halstabletter-salmiak-hallon-96148037',
      ),
    ).toBe('96148037');
  });

  it('handles a slug that is nothing but the id', () => {
    expect(
      eanFromProductUrl('https://www.coop.se/handla/varor/7310865085733'),
    ).toBe('7310865085733');
  });

  it('ignores a trailing slash, a query string and a fragment', () => {
    expect(eanFromProductUrl(`${PRODUCT_URL}/`)).toBe('11210000018');
    expect(eanFromProductUrl(`${PRODUCT_URL}?utm_source=x`)).toBe(
      '11210000018',
    );
    expect(eanFromProductUrl(`${PRODUCT_URL}#top`)).toBe('11210000018');
  });

  it('returns null for anything that is not a product page', () => {
    // The sitemap index, whose entries are other sitemaps.
    expect(
      eanFromProductUrl('https://www.coop.se/handla/sitemap_products.xml'),
    ).toBeNull();
    expect(
      eanFromProductUrl('https://www.coop.se/recept/pannkakor'),
    ).toBeNull();
    // Too short to be an id, so it reads as part of a name.
    expect(
      eanFromProductUrl('https://www.coop.se/handla/varor/mjolk-3'),
    ).toBeNull();
  });
});

describe('eansFromSitemap', () => {
  it('pulls every product id out in document order', () => {
    const xml = sitemap([
      PRODUCT_URL,
      'https://www.coop.se/handla/varor/skafferi/tex-mex/sas-salsa/salsa-picante-11210693005',
      'https://www.coop.se/handla/varor/fritid/bocker-film/bocker/helix-9789150965520',
    ]);
    expect(eansFromSitemap(xml)).toEqual([
      '11210000018',
      '11210693005',
      '9789150965520',
    ]);
  });

  it('dedupes and skips non-product entries rather than failing the file', () => {
    const xml = sitemap([
      PRODUCT_URL,
      'https://www.coop.se/recept/pannkakor',
      PRODUCT_URL,
    ]);
    expect(eansFromSitemap(xml)).toEqual(['11210000018']);
  });

  it('is empty for a document with no urls in it', () => {
    expect(eansFromSitemap('<urlset></urlset>')).toEqual([]);
  });
});

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
