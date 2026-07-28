import { describe, expect, it } from 'bun:test';
import type { CatalogRow } from '../../src/lib/catalogApi';
import type { ReceiptHeader, ReceiptItemDoc } from '../../src/lib/convexApi';
import { ZERO_MACROS, type Macros } from '../../src/lib/nutrition';
import {
  groupPantry,
  pantryStock,
  remainingFraction,
} from '../../src/lib/pantry';
import type { PurchaseLine } from '../../src/lib/purchases';

function product(ean: string, name = `Product ${ean}`): CatalogRow {
  return {
    _id: `catalog_${ean}` as CatalogRow['_id'],
    _creationTime: 0,
    ean,
    name,
    store: 'coop',
    sourceTable: 'raw_coop',
    sourceId: 'raw_1',
  };
}

function line(
  ean: string,
  day: string,
  macros: Partial<Macros> | null,
  quantity = 1,
  price = 20,
): PurchaseLine {
  return {
    item: {
      _id: `${ean}-${day}` as ReceiptItemDoc['_id'],
      _creationTime: 0,
      receiptId: 'r1' as ReceiptItemDoc['receiptId'],
      lineNo: 1,
      text: name(ean),
      price,
      isDiscount: false,
      quantity,
    },
    header: {} as ReceiptHeader,
    day,
    purchasedAt: new Date(`${day}T12:00:00`),
    product: product(ean),
    macros: macros ? { ...ZERO_MACROS, ...macros } : null,
  };
}

function name(ean: string): string {
  return `LINE ${ean}`;
}

describe('remainingFraction', () => {
  const bought = new Date(2026, 2, 1);

  it('is 1 on the day of purchase and 0 once the window closes', () => {
    expect(remainingFraction(bought, bought, 10)).toBe(1);
    expect(remainingFraction(bought, new Date(2026, 2, 11), 10)).toBe(0);
    expect(remainingFraction(bought, new Date(2026, 3, 1), 10)).toBe(0);
  });

  it('decays linearly across the window', () => {
    expect(remainingFraction(bought, new Date(2026, 2, 6), 10)).toBeCloseTo(
      0.5,
      6,
    );
  });

  it('clamps a future-dated receipt to 1 rather than exceeding it', () => {
    expect(remainingFraction(new Date(2026, 2, 10), bought, 10)).toBe(1);
  });
});

describe('groupPantry', () => {
  const now = new Date(2026, 2, 1, 12);

  it('aggregates every line for a product into one group', () => {
    const groups = groupPantry(
      [
        line('111', '2026-03-01', { kcal: 100, protein: 10 }, 2, 30),
        line('111', '2026-02-25', { kcal: 100, protein: 10 }, 1, 20),
      ],
      now,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.unitsBought).toBe(3);
    expect(groups[0]?.spend).toBe(50);
    expect(groups[0]?.lines).toBe(2);
    expect(groups[0]?.totalMacros?.kcal).toBe(200);
  });

  it('tracks the first and last purchase regardless of input order', () => {
    const [group] = groupPantry(
      [
        line('111', '2026-03-01', { kcal: 1 }),
        line('111', '2026-01-05', { kcal: 1 }),
        line('111', '2026-02-10', { kcal: 1 }),
      ],
      now,
    );
    expect(group?.firstPurchase.getMonth()).toBe(0);
    expect(group?.lastPurchase.getMonth()).toBe(2);
  });

  it('sorts by total energy, biggest first', () => {
    const groups = groupPantry(
      [
        line('small', '2026-03-01', { kcal: 10 }),
        line('big', '2026-03-01', { kcal: 900 }),
      ],
      now,
    );
    expect(groups[0]?.ean).toBe('big');
  });

  it('keeps a product with no usable nutrition, at the bottom', () => {
    const groups = groupPantry(
      [
        line('withMacros', '2026-03-01', { kcal: 100 }),
        line('noMacros', '2026-03-01', null),
      ],
      now,
    );
    expect(groups).toHaveLength(2);
    expect(groups[1]?.ean).toBe('noMacros');
    expect(groups[1]?.totalMacros).toBeNull();
  });

  it('skips lines with no product — those belong to the Unmapped tab', () => {
    const orphan = { ...line('111', '2026-03-01', { kcal: 5 }), product: null };
    expect(groupPantry([orphan], now)).toEqual([]);
  });

  it('leaves nothing remaining once every purchase is past its window', () => {
    const [group] = groupPantry(
      [line('111', '2026-01-01', { kcal: 100, protein: 10 })],
      now,
      10,
    );
    expect(group?.remainingMacros.kcal).toBe(0);
    expect(group?.remainingFraction).toBe(0);
  });

  it('weights a product with no nutrition by units, not by input order', () => {
    const old = line('111', '2026-01-01', null);
    const fresh = line('111', '2026-03-01', null);
    const newestFirst = groupPantry([fresh, old], now, 10);
    const oldestFirst = groupPantry([old, fresh], now, 10);
    // One of the two purchases is inside the window, so half the units remain
    // either way. Seeding from the first line gave 1 or 0 depending on order.
    expect(newestFirst[0]?.remainingFraction).toBeCloseTo(0.5, 6);
    expect(oldestFirst[0]?.remainingFraction).toBeCloseTo(0.5, 6);
  });

  it('counts a half-consumed unnutritious product as still on the shelf', () => {
    const groups = groupPantry(
      [line('111', '2026-01-01', null), line('111', '2026-03-01', null)],
      now,
      10,
    );
    expect(pantryStock(groups, 10).products).toBe(1);
  });
});

describe('pantryStock', () => {
  const now = new Date(2026, 2, 1, 12);

  it('divides remaining protein by the account’s own daily rate', () => {
    const groups = groupPantry(
      [line('111', '2026-03-01', { kcal: 1000, protein: 100 })],
      now,
      10,
    );
    // Fully remaining on the day of purchase, so 100 g at 20 g/day is 5 days.
    expect(pantryStock(groups, 20).proteinDays).toBeCloseTo(5, 6);
  });

  it('reports null protein days rather than dividing by a zero rate', () => {
    const groups = groupPantry(
      [line('111', '2026-03-01', { protein: 50 })],
      now,
    );
    expect(pantryStock(groups, 0).proteinDays).toBeNull();
  });

  it('excludes fully consumed products from the shelf count', () => {
    const groups = groupPantry(
      [line('111', '2026-01-01', { kcal: 100 })],
      now,
      10,
    );
    expect(pantryStock(groups, 10).products).toBe(0);
  });
});
