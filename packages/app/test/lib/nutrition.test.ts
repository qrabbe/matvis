import { describe, expect, it } from 'bun:test';
import type { CatalogRow, ReceiptItemDoc } from '@matvis/shared';
import {
  CONSUMPTION_WINDOW_DAYS,
  energySplit,
  itemMacros,
  purchasedAmount,
  spreadOverWindow,
  ZERO_MACROS,
} from '../../src/lib/nutrition';

/** A catalog row with just the fields the nutrition math reads. */
function product(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    _id: 'catalog_1' as CatalogRow['_id'],
    _creationTime: 0,
    ean: '7311312009203',
    name: 'Test product',
    store: 'coop',
    sourceTable: 'raw_coop',
    sourceId: 'raw_1',
    packageSize: 500,
    packageSizeUnit: 'Gram',
    food: {
      nutrition: {
        basisQuantity: 100,
        basisUnit: 'g',
        energyKcal: 200,
        proteinG: 10,
        fatG: 5,
        carbohydrateG: 30,
        sugarsG: 2,
        fiberG: 3,
        saturatedFatG: 1,
        saltG: 0.5,
      },
    },
    ...overrides,
  };
}

function line(overrides: Partial<ReceiptItemDoc> = {}): ReceiptItemDoc {
  return {
    _id: 'item_1' as ReceiptItemDoc['_id'],
    _creationTime: 0,
    receiptId: 'receipt_1' as ReceiptItemDoc['receiptId'],
    lineNo: 1,
    text: 'TEST 32,95',
    price: 32.95,
    isDiscount: false,
    ...overrides,
  };
}

describe('purchasedAmount', () => {
  it('multiplies count lines by the package net content', () => {
    // 2 packages x 500 g = 1000 g
    expect(
      purchasedAmount(line({ quantity: 2, unit: 'ST' }), product(), 'g'),
    ).toBe(1000);
  });

  it('treats a line with no unit as one package', () => {
    expect(purchasedAmount(line(), product(), 'g')).toBe(500);
  });

  it('uses the printed quantity directly for weighed lines, ignoring package size', () => {
    // 0.652 KG of loose bananas is 652 g, NOT 0.652 x a package.
    expect(
      purchasedAmount(line({ quantity: 0.652, unit: 'KG' }), product(), 'g'),
    ).toBe(652);
  });

  it('converts a package size stated in a different unit of the same dimension', () => {
    // The old repo's 1000x bug in reverse: 1.5 l against a 100 ml basis.
    const bottle = product({ packageSize: 1.5, packageSizeUnit: 'Liter' });
    expect(purchasedAmount(line(), bottle, 'ml')).toBe(1500);
  });

  it('returns null when the package unit is a different dimension to the basis', () => {
    const bottle = product({ packageSize: 1.5, packageSizeUnit: 'Liter' });
    expect(purchasedAmount(line(), bottle, 'g')).toBeNull();
  });

  it('returns null when the package unit is unrecognisable', () => {
    const odd = product({ packageSize: 6, packageSizeUnit: 'knippe' });
    expect(purchasedAmount(line(), odd, 'g')).toBeNull();
  });

  it('returns null when a count line has no package size to scale by', () => {
    const sizeless = product({ packageSize: undefined });
    expect(purchasedAmount(line(), sizeless, 'g')).toBeNull();
  });

  it('needs no package size when nutrition is stated per piece', () => {
    const sizeless = product({ packageSize: undefined });
    expect(purchasedAmount(line({ quantity: 3 }), sizeless, 'st')).toBe(3);
  });
});

describe('itemMacros', () => {
  it('scales every slot by the purchased amount over the basis', () => {
    // 500 g bought against a 100 g basis is a scale of 5.
    const macros = itemMacros(line(), product());
    expect(macros).not.toBeNull();
    expect(macros?.kcal).toBe(1000);
    expect(macros?.protein).toBe(50);
    expect(macros?.carbs).toBe(150);
  });

  it('scales a 1.5 l bottle against a 100 ml basis by 15, not 0.015', () => {
    const bottle = product({
      packageSize: 1.5,
      packageSizeUnit: 'Liter',
      food: {
        nutrition: { basisQuantity: 100, basisUnit: 'ml', energyKcal: 40 },
      },
    });
    expect(itemMacros(line(), bottle)?.kcal).toBe(600);
  });

  it('returns null when the product carries no nutrition block', () => {
    expect(itemMacros(line(), product({ food: undefined }))).toBeNull();
  });

  it('returns null rather than zero when the line cannot be scaled', () => {
    const bottle = product({ packageSize: 1.5, packageSizeUnit: 'Liter' });
    // Basis is grams, package is litres: no defensible conversion exists.
    expect(itemMacros(line(), bottle)).toBeNull();
  });

  it('treats a zero or negative basis quantity as unusable', () => {
    const broken = product({
      food: {
        nutrition: { basisQuantity: 0, basisUnit: 'g', energyKcal: 100 },
      },
    });
    expect(itemMacros(line(), broken)).toBeNull();
  });

  it('fills absent nutrients with zero rather than dropping the line', () => {
    const sparse = product({
      food: {
        nutrition: { basisQuantity: 100, basisUnit: 'g', energyKcal: 100 },
      },
    });
    const macros = itemMacros(line(), sparse);
    expect(macros?.kcal).toBe(500);
    expect(macros?.protein).toBe(0);
  });
});

describe('spreadOverWindow', () => {
  it('splits macros evenly across the window, starting on the purchase day', () => {
    const shares = spreadOverWindow(new Date(2026, 2, 1), {
      ...ZERO_MACROS,
      kcal: 1000,
    });
    expect(shares).toHaveLength(CONSUMPTION_WINDOW_DAYS);
    expect(shares[0]?.day).toBe('2026-03-01');
    expect(shares[0]?.macros.kcal).toBe(100);
    expect(shares[9]?.day).toBe('2026-03-10');
  });

  it('crosses a month boundary', () => {
    const shares = spreadOverWindow(
      new Date(2026, 2, 28),
      { ...ZERO_MACROS, kcal: 10 },
      5,
    );
    expect(shares.map((share) => share.day)).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
    ]);
  });
});

describe('energySplit', () => {
  it('splits energy on the Atwater factors and always sums to 1', () => {
    // 10 g protein (40) + 10 g fat (90) + 10 g carbs (40) = 170 kcal
    const split = energySplit({
      ...ZERO_MACROS,
      protein: 10,
      fat: 10,
      carbs: 10,
    });
    expect(split).not.toBeNull();
    expect(split!.protein).toBeCloseTo(40 / 170, 6);
    expect(split!.fat).toBeCloseTo(90 / 170, 6);
    expect(split!.protein + split!.fat + split!.carbs).toBeCloseTo(1, 10);
  });

  it('returns null when there is no energy to split', () => {
    expect(energySplit(ZERO_MACROS)).toBeNull();
  });
});
