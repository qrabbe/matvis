import { describe, expect, it } from 'bun:test';
import type { Doc } from '../convex/_generated/dataModel';
import {
  categoryPathFromCoop,
  labelsFromCoop,
  nutritionFromCoop,
  parseNutrientAmount,
  projectCoop,
  webImageUrl,
} from '../convex/model/project';

/** Build a `raw_coop` doc from the handful of fields a test cares about. The
 * system fields are filled in so the projector sees a realistic document. */
function rawCoop(fields: Partial<Doc<'raw_coop'>>): Doc<'raw_coop'> {
  return {
    _id: 'raw_coop_test_id' as Doc<'raw_coop'>['_id'],
    _creationTime: 0,
    ...fields,
  };
}

/** The nutrition block as Coop actually ships it: amounts are single-element
 * string arrays, and Energi appears twice under one description. */
function nutrientLinks(
  entries: [description: string, unit: string | undefined, amount: string][],
): Doc<'raw_coop'>['nutrientLinks'] {
  return entries.map(([description, unit, amount]) => ({
    description,
    unit,
    amount: [amount],
  }));
}

const FULL_NUTRIENTS = nutrientLinks([
  ['Energi', 'Kilojoule', '2466'],
  ['Energi', 'Kilokalori', '595'],
  ['Fett', 'Gram', '47'],
  ['Varav mättat fett', 'Gram', '7'],
  ['Kolhydrat', 'Gram', '11'],
  ['Varav sockerarter', 'Gram', '6'],
  ['Fiber', 'Gram', '2.4'],
  ['Protein', 'Gram', '28'],
  ['Salt', 'Gram', '1.8'],
]);

const GRAM_BASIS: Doc<'raw_coop'>['nutrientInformation'] = [
  {
    header: {
      nutrientBasisQuantity: 100,
      nutrientBasisQuantityType: 'BY_MEASURE',
      nutrientBasisQuantityUnit: { code: 'GRM', value: 'Gram' },
    },
  },
];

describe('parseNutrientAmount', () => {
  it('reads the single-element array the source actually sends', () => {
    expect(parseNutrientAmount(['2466'])).toBe(2466);
    expect(parseNutrientAmount(['3.6'])).toBe(3.6);
  });

  it('reads a bare string too, since the field is typed for both', () => {
    expect(parseNutrientAmount('12')).toBe(12);
  });

  it('accepts a comma decimal separator', () => {
    expect(parseNutrientAmount(['0,5'])).toBe(0.5);
    expect(parseNutrientAmount(['12,75'])).toBe(12.75);
  });

  it('reads the number out of an approximate value', () => {
    expect(parseNutrientAmount(['<0,5'])).toBe(0.5);
    expect(parseNutrientAmount(['< 0.5'])).toBe(0.5);
  });

  it('drops what it cannot read rather than throwing', () => {
    expect(parseNutrientAmount(undefined)).toBeUndefined();
    expect(parseNutrientAmount([])).toBeUndefined();
    expect(parseNutrientAmount([''])).toBeUndefined();
    expect(parseNutrientAmount(['spårmängder'])).toBeUndefined();
  });

  it('keeps a zero, which is a real reading and not an absence', () => {
    expect(parseNutrientAmount(['0'])).toBe(0);
    expect(parseNutrientAmount(['0.0000'])).toBe(0);
  });
});

describe('nutritionFromCoop', () => {
  it('maps the full Swedish vocabulary onto the fixed slots', () => {
    expect(
      nutritionFromCoop(
        rawCoop({
          nutrientLinks: FULL_NUTRIENTS,
          nutrientBasis: { quantity: 100 },
          nutrientInformation: GRAM_BASIS,
        }),
      ),
    ).toEqual({
      basisQuantity: 100,
      basisUnit: 'g',
      energyKj: 2466,
      energyKcal: 595,
      fatG: 47,
      saturatedFatG: 7,
      carbohydrateG: 11,
      sugarsG: 6,
      fiberG: 2.4,
      proteinG: 28,
      saltG: 1.8,
    });
  });

  it('tells the two Energi rows apart by unit, not by description', () => {
    const nutrition = nutritionFromCoop(
      rawCoop({
        nutrientLinks: nutrientLinks([
          ['Energi', 'Kilojoule', '838'],
          ['Energi', 'Kilokalori', '203'],
        ]),
        nutrientBasis: { quantity: 100 },
      }),
    );
    expect(nutrition?.energyKj).toBe(838);
    expect(nutrition?.energyKcal).toBe(203);
  });

  it('drops an Energi row whose unit does not say which one it is', () => {
    const nutrition = nutritionFromCoop(
      rawCoop({
        nutrientLinks: nutrientLinks([['Energi', undefined, '838']]),
        nutrientBasis: { quantity: 100 },
      }),
    );
    expect(nutrition?.energyKj).toBeUndefined();
    expect(nutrition?.energyKcal).toBeUndefined();
  });

  it('carries the basis unit and quantity through', () => {
    expect(
      nutritionFromCoop(
        rawCoop({
          nutrientLinks: nutrientLinks([['Protein', 'Gram', '1.3']]),
          nutrientBasis: { quantity: 330 },
          nutrientInformation: [
            {
              header: {
                nutrientBasisQuantity: 330,
                nutrientBasisQuantityUnit: { code: 'MLT', value: 'Milliliter' },
              },
            },
          ],
        }),
      ),
    ).toEqual({ basisQuantity: 330, basisUnit: 'ml', proteinG: 1.3 });
  });

  it('falls back to grams when the source states no basis unit', () => {
    expect(
      nutritionFromCoop(
        rawCoop({
          nutrientLinks: nutrientLinks([['Salt', 'Gram', '1.9']]),
          nutrientBasis: { quantity: 100 },
        }),
      )?.basisUnit,
    ).toBe('g');
  });

  it('takes the basis quantity from the header when nutrientBasis lacks it', () => {
    expect(
      nutritionFromCoop(
        rawCoop({
          nutrientLinks: nutrientLinks([['Fett', 'Gram', '17']]),
          nutrientBasis: {},
          nutrientInformation: GRAM_BASIS,
        }),
      )?.basisQuantity,
    ).toBe(100);
  });

  it('emits nothing when no basis is stated — "13 g" per an unknown amount is not a fact', () => {
    expect(
      nutritionFromCoop(rawCoop({ nutrientLinks: FULL_NUTRIENTS })),
    ).toBeUndefined();
  });

  it('emits nothing when the row has no nutrients at all', () => {
    expect(
      nutritionFromCoop(rawCoop({ nutrientBasis: { quantity: 100 } })),
    ).toBeUndefined();
    expect(nutritionFromCoop(rawCoop({ nutrientLinks: [] }))).toBeUndefined();
  });

  it('ignores nutrients outside the fixed slots', () => {
    expect(
      nutritionFromCoop(
        rawCoop({
          nutrientLinks: nutrientLinks([
            ['Vitamin D', 'Mikrogram', '0.75'],
            ['TEMP_EFCBFBFFBAEFDE', undefined, ''],
            ['Salt', 'Gram', '0.04'],
          ]),
          nutrientBasis: { quantity: 100 },
        }),
      ),
    ).toEqual({ basisQuantity: 100, basisUnit: 'g', saltG: 0.04 });
  });

  it('drops an unreadable amount but keeps the rest of the row', () => {
    expect(
      nutritionFromCoop(
        rawCoop({
          nutrientLinks: nutrientLinks([
            ['Fett', 'Gram', 'okänd'],
            ['Protein', 'Gram', '9'],
          ]),
          nutrientBasis: { quantity: 100 },
        }),
      ),
    ).toEqual({ basisQuantity: 100, basisUnit: 'g', proteinG: 9 });
  });

  it('matches the vocabulary case- and whitespace-insensitively', () => {
    expect(
      nutritionFromCoop(
        rawCoop({
          nutrientLinks: nutrientLinks([
            ['  VARAV SOCKERARTER ', ' gram ', '6'],
          ]),
          nutrientBasis: { quantity: 100 },
        }),
      )?.sugarsG,
    ).toBe(6);
  });

  it('keeps the first reading when a nutrient is repeated', () => {
    expect(
      nutritionFromCoop(
        rawCoop({
          nutrientLinks: nutrientLinks([
            ['Protein', 'Gram', '9'],
            ['Protein', 'Gram', '99'],
          ]),
          nutrientBasis: { quantity: 100 },
        }),
      )?.proteinG,
    ).toBe(9);
  });
});

describe('categoryPathFromCoop', () => {
  it('walks superCategories upward and returns the path root-first', () => {
    expect(
      categoryPathFromCoop(
        rawCoop({
          navCategories: [
            {
              code: '33841',
              name: 'Sås',
              superCategories: [
                {
                  code: '33761',
                  name: 'Asiatiska livsmedel',
                  superCategories: [
                    { code: '21330', name: 'Skafferi', superCategories: [] },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    ).toEqual(['Skafferi', 'Asiatiska livsmedel', 'Sås']);
  });

  it('handles a leaf with no parents', () => {
    expect(
      categoryPathFromCoop(
        rawCoop({
          navCategories: [
            { code: '21330', name: 'Skafferi', superCategories: [] },
          ],
        }),
      ),
    ).toEqual(['Skafferi']);
  });

  it('emits nothing when the row is uncategorised', () => {
    expect(categoryPathFromCoop(rawCoop({}))).toBeUndefined();
    expect(
      categoryPathFromCoop(rawCoop({ navCategories: [] })),
    ).toBeUndefined();
  });
});

describe('labelsFromCoop', () => {
  it('takes the display names and drops tags that have none', () => {
    expect(
      labelsFromCoop(
        rawCoop({
          accreditedTags: [
            { code: 'KRAV_MARK', description: 'KRAV' },
            { code: 'GREEN_DOT' },
            { code: 'NYCKELHALET', description: 'Nyckelhålet' },
          ],
        }),
      ),
    ).toEqual(['KRAV', 'Nyckelhålet']);
  });

  it('dedups the distinct codes that share one name', () => {
    expect(
      labelsFromCoop(
        rawCoop({
          accreditedTags: [
            {
              code: 'FOREST_STEWARDSHIP_COUNCIL_MIX',
              description: 'FSC för hållbart skogsbruk',
            },
            {
              code: 'FOREST_STEWARDSHIP_COUNCIL_LABEL',
              description: 'FSC för hållbart skogsbruk',
            },
          ],
        }),
      ),
    ).toEqual(['FSC för hållbart skogsbruk']);
  });

  it('emits nothing when no tag carries a name', () => {
    expect(labelsFromCoop(rawCoop({}))).toBeUndefined();
    expect(
      labelsFromCoop(rawCoop({ accreditedTags: [{ code: 'GREEN_DOT' }] })),
    ).toBeUndefined();
  });
});

describe('webImageUrl', () => {
  it('upgrades the scheme and asks Cloudinary for a web format', () => {
    expect(
      webImageUrl(
        'http://res.cloudinary.com/coopsverige/image/upload/v1747725154/cloud/482142.tiff',
      ),
    ).toBe(
      'https://res.cloudinary.com/coopsverige/image/upload/f_auto,q_auto/v1747725154/cloud/482142.tiff',
    );
  });

  it('leaves an already-https Cloudinary URL on https', () => {
    expect(
      webImageUrl(
        'https://res.cloudinary.com/coopsverige/image/upload/v1593588377/402636.tiff',
      ),
    ).toBe(
      'https://res.cloudinary.com/coopsverige/image/upload/f_auto,q_auto/v1593588377/402636.tiff',
    );
  });

  it('passes a non-Cloudinary URL through, fixing only the scheme', () => {
    expect(webImageUrl('http://example.test/a.jpg')).toBe(
      'https://example.test/a.jpg',
    );
  });

  it('emits nothing for a missing or blank URL', () => {
    expect(webImageUrl(undefined)).toBeUndefined();
    expect(webImageUrl('   ')).toBeUndefined();
  });
});

describe('projectCoop', () => {
  it('skips a row without the two fields the clean table requires', () => {
    expect(projectCoop(rawCoop({ name: 'Sås Tikka Masala' }))).toBeNull();
    expect(projectCoop(rawCoop({ ean: '7311312009203' }))).toBeNull();
  });

  it('projects the shelf-card and descriptive fields', () => {
    expect(
      projectCoop(
        rawCoop({
          ean: '7311312009203',
          name: 'Sås Tikka Masala',
          manufacturerName: 'Santa Maria',
          packageSize: 360,
          packageSizeUnit: 'Gram',
          packageSizeInformation: '360g',
          salesUnit: 'Styck',
          description: 'En klassisk och tidlös indisk smak.',
          countryOfOriginCodes: [{ code: '752', value: 'Sverige' }],
        }),
      ),
    ).toMatchObject({
      ean: '7311312009203',
      name: 'Sås Tikka Masala',
      brand: 'Santa Maria',
      packageSize: 360,
      packageSizeUnit: 'Gram',
      packageSizeText: '360g',
      salesUnit: 'Styck',
      description: 'En klassisk och tidlös indisk smak.',
      countryOfOrigin: 'Sverige',
    });
  });

  it('takes the first country when a product lists several', () => {
    expect(
      projectCoop(
        rawCoop({
          ean: '1',
          name: 'Blandning',
          countryOfOriginCodes: [
            { code: '752', value: 'Sverige' },
            { code: '276', value: 'Tyskland' },
          ],
        }),
      )?.countryOfOrigin,
    ).toBe('Sverige');
  });

  it('omits `food` entirely for a product with neither ingredients nor nutrition', () => {
    const clean = projectCoop(rawCoop({ ean: '1', name: 'Tandborste Mjuk' }));
    expect(clean).not.toBeNull();
    expect(clean?.food).toBeUndefined();
  });

  it('emits `food` for a product that only has ingredients', () => {
    expect(
      projectCoop(
        rawCoop({
          ean: '1',
          name: 'Kanel',
          listOfIngredients: 'Malen kanel.',
        }),
      )?.food,
    ).toEqual({ ingredients: 'Malen kanel.', nutrition: undefined });
  });

  it('emits `food` for a product that only has nutrition', () => {
    const food = projectCoop(
      rawCoop({
        ean: '1',
        name: 'Läsk',
        nutrientLinks: nutrientLinks([['Salt', 'Gram', '0.01']]),
        nutrientBasis: { quantity: 100 },
      }),
    )?.food;
    expect(food?.ingredients).toBeUndefined();
    expect(food?.nutrition?.saltG).toBe(0.01);
  });

  it('treats a blank string as an absent field rather than an empty value', () => {
    const clean = projectCoop(
      rawCoop({
        ean: '1',
        name: 'Tandborste',
        description: '   ',
        manufacturerName: '',
        listOfIngredients: ' ',
      }),
    );
    expect(clean?.description).toBeUndefined();
    expect(clean?.brand).toBeUndefined();
    expect(clean?.food).toBeUndefined();
  });
});
