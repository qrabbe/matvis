import { describe, expect, test } from 'vitest';
import { netContentFromName, nutritionFromIca, parseIcaProduct } from './parse';

/** The shape of a real product page, trimmed to the parts that carry data. */
const PAGE = `
<html><head>
<meta itemprop="productId" content="2009660">
<meta itemprop="mpn" content="7316562700078">
<meta itemprop="name" content="Kräftor Fryst 20-p 700g Pandalus">
<link itemprop="image" href="https://assets.icanet.se/image/upload/x.webp">
<meta itemprop="description">
<meta itemprop="sku" content="7316562700078">
<meta itemprop="categories" content="[&#34;Fryst&#34;,&#34;Fryst fisk &#38; Skaldjur&#34;,&#34;Frysta kräftor&#34;]">
<span itemprop="brand"><meta itemprop="name" content="Pandalus"></span>
</head><body>
<h2>Ingredienser</h2><p>Ingredienser: Kokta kräftor, vatten, salt.</p>
<h2>Näringsdeklaration</h2><div><table><tbody>
<tr><th>Näringsvärde</th><th>100 Gram</th><th>% av DRI(*)</th></tr>
<tr><td>Energi (kcal)</td><td>73 kcal</td><td></td></tr>
<tr><td>Energi (kJ)</td><td>308 kJ</td><td></td></tr>
<tr><td>Fett</td><td>0.6 g</td><td></td></tr>
<tr><td>Varav mättat fett</td><td>0.2 g</td><td></td></tr>
<tr><td>Kolhydrat</td><td>0.5 g</td><td></td></tr>
<tr><td>Varav sockerarter</td><td>0 g</td><td></td></tr>
<tr><td>Protein</td><td>16.3 g</td><td></td></tr>
<tr><td>Salt</td><td>2.5 g</td><td></td></tr>
<tr><td>Vitamin C</td><td>40 mg</td><td>50</td></tr>
</tbody></table></div>
</body></html>`;

describe('parseIcaProduct', () => {
  test('reads the identity, brand, image and flat category path', () => {
    const product = parseIcaProduct(PAGE);
    expect(product).toMatchObject({
      ean: '7316562700078',
      name: 'Kräftor Fryst 20-p 700g Pandalus',
      brand: 'Pandalus',
      imageUrl: 'https://assets.icanet.se/image/upload/x.webp',
      // Already leaf-last and flat, so none of Coop's superCategories walk.
      categoryPath: ['Fryst', 'Fryst fisk & Skaldjur', 'Frysta kräftor'],
    });
    // An empty `content`-less meta is absent, not an empty string.
    expect(product!.description).toBeUndefined();
  });

  test('drops the repeated label off the ingredients prose', () => {
    expect(parseIcaProduct(PAGE)!.ingredients).toBe(
      'Kokta kräftor, vatten, salt.',
    );
  });

  test('an empty sku falls back to the mpn rather than to nothing', () => {
    // `meta` answers `''` for a `content=""` attribute, and `'' ?? mpn` is `''`,
    // so the fallback the two tags exist for never ran on the one page shape
    // that needs it.
    const page = PAGE.replace(
      '<meta itemprop="sku" content="7316562700078">',
      '<meta itemprop="sku" content="">',
    );
    expect(parseIcaProduct(page)!.ean).toBe('7316562700078');
  });

  test('refuses a page carrying no EAN or no name', () => {
    expect(parseIcaProduct('<html></html>')).toBeNull();
    expect(parseIcaProduct('<meta itemprop="sku" content="73165">')).toBeNull();
  });
});

describe('nutritionFromIca', () => {
  test('fills the same slots Coop does, from the same Swedish labels', () => {
    expect(nutritionFromIca(PAGE)).toEqual({
      basisQuantity: 100,
      basisUnit: 'g',
      energyKcal: 73,
      energyKj: 308,
      fatG: 0.6,
      saturatedFatG: 0.2,
      carbohydrateG: 0.5,
      sugarsG: 0,
      proteinG: 16.3,
      saltG: 2.5,
    });
  });

  test('ignores rows CatalogNutrition has no slot for', () => {
    // Vitamin C is on the page and has no slot, and `% av DRI` is not a
    // nutrient at all. Neither may leak into the shape.
    const nutrition = nutritionFromIca(PAGE)!;
    expect(Object.keys(nutrition)).not.toContain('vitaminC');
    expect(Object.values(nutrition)).not.toContain(50);
  });

  test('reads a millilitre basis as well as a gram one', () => {
    const drink = PAGE.replace('<th>100 Gram</th>', '<th>100 ml</th>');
    expect(nutritionFromIca(drink)).toMatchObject({
      basisQuantity: 100,
      basisUnit: 'ml',
    });
  });

  test('is absent when the page states no nutrition table', () => {
    expect(nutritionFromIca('<html>nothing here</html>')).toBeUndefined();
  });
});

describe('netContentFromName', () => {
  test('reads the pack size ICA states nowhere else', () => {
    expect(netContentFromName('Pepparsås 57ml Tabasco')).toEqual({
      value: 57,
      unit: 'ml',
    });
    expect(
      netContentFromName('Kattsand Fresh Apple Vit 8,7kg PrimaCat'),
    ).toEqual({ value: 8700, unit: 'g' });
    expect(netContentFromName('Grädde 5 dl Arla')).toEqual({
      value: 500,
      unit: 'ml',
    });
  });

  test('a pack count next to a size does not become the size', () => {
    expect(netContentFromName('Kräftor Fryst 20-p 700g Pandalus')).toEqual({
      value: 700,
      unit: 'g',
    });
  });

  test('two stated sizes are ambiguous rather than nearly right', () => {
    // A 400 g jar of which 210 g is herring, and four 113 g patties totalling
    // 452 g. Picking either number would be wrong about half the time.
    expect(
      netContentFromName('Inlagd Sill Rolmopsy 400g varav sill 210g Seko'),
    ).toBeUndefined();
    expect(
      netContentFromName('Hamburgare Tex-Mex 4-p 113g 452g ICA'),
    ).toBeUndefined();
  });

  test('units that are not net contents are left alone', () => {
    // A jack diameter, a lamp, a count and a percentage. `mm` is excluded from
    // the lookup for exactly this reason even though CATALOG_UNITS carries it.
    expect(
      netContentFromName('Adapter Lightning Vit 3,5mm Apple'),
    ).toBeUndefined();
    expect(
      netContentFromName('LED G125 Gold E27 300lm(28W) Osram'),
    ).toBeUndefined();
    expect(
      netContentFromName('Blodapelsin 4-pack Klass 1 ICA'),
    ).toBeUndefined();
    expect(netContentFromName('Kaffe 100% Arabica')).toBeUndefined();
  });

  test('a name stating no size has none', () => {
    expect(netContentFromName('Högtalare Clip 5')).toBeUndefined();
    expect(netContentFromName('Dinkelmjöl Siktat Wapnö Eko')).toBeUndefined();
  });
});
