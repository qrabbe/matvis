import { describe, expect, it } from 'bun:test';
import type { CatalogRow, ReceiptHeader, ReceiptItemDoc } from '@matvis/shared';
import {
  allocateConsumption,
  type ConsumptionEvent,
} from '../../src/lib/consumption';
import { ZERO_MACROS, type Macros } from '../../src/lib/nutrition';
import { groupPantry, pantryStock } from '../../src/lib/pantry';
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
      text: `LINE ${ean}`,
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

function event(
  ean: string,
  quantity: number,
  consumedAt: string,
): ConsumptionEvent {
  return { ean, quantity, consumedAt: new Date(consumedAt).getTime() };
}

describe('groupPantry', () => {
  it('aggregates every outstanding line for a product into one group', () => {
    const allocations = allocateConsumption(
      [
        line('111', '2026-03-01', { kcal: 100, protein: 10 }, 2, 30),
        line('111', '2026-02-25', { kcal: 100, protein: 10 }, 1, 20),
      ],
      [],
    );
    const groups = groupPantry(allocations);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.outstandingQuantity).toBe(3);
    expect(groups[0]?.spend).toBe(50);
    expect(groups[0]?.lines).toBe(2);
    expect(groups[0]?.totalMacros?.kcal).toBe(200);
  });

  it('tracks the first and last purchase regardless of input order', () => {
    const allocations = allocateConsumption(
      [
        line('111', '2026-03-01', { kcal: 1 }),
        line('111', '2026-01-05', { kcal: 1 }),
        line('111', '2026-02-10', { kcal: 1 }),
      ],
      [],
    );
    const [group] = groupPantry(allocations);
    expect(group?.firstPurchase.getMonth()).toBe(0);
    expect(group?.lastPurchase.getMonth()).toBe(2);
  });

  it('sorts by total energy, biggest first', () => {
    const allocations = allocateConsumption(
      [
        line('small', '2026-03-01', { kcal: 10 }),
        line('big', '2026-03-01', { kcal: 900 }),
      ],
      [],
    );
    const groups = groupPantry(allocations);
    expect(groups[0]?.ean).toBe('big');
  });

  it('skips lines with no product — those belong to the Unmapped tab', () => {
    const orphan = { ...line('111', '2026-03-01', { kcal: 5 }), product: null };
    const allocations = allocateConsumption([orphan], []);
    expect(groupPantry(allocations)).toEqual([]);
  });

  it('depletes the oldest purchase first when a product is marked used', () => {
    const lines = [
      line('111', '2026-01-01', { kcal: 100, protein: 10 }, 1),
      line('111', '2026-02-01', { kcal: 100, protein: 10 }, 1),
    ];
    const allocations = allocateConsumption(lines, [
      event('111', 1, '2026-02-15'),
    ]);
    const [group] = groupPantry(allocations);
    // The 1 remaining unit is the Feb purchase, not the Jan one — FIFO.
    expect(group?.outstandingQuantity).toBe(1);
    expect(group?.firstPurchase.getMonth()).toBe(1);
  });

  it('drops a product entirely once every unit is consumed', () => {
    const allocations = allocateConsumption(
      [line('111', '2026-01-01', { kcal: 100 }, 1)],
      [event('111', 1, '2026-01-05')],
    );
    expect(groupPantry(allocations)).toEqual([]);
  });

  it('leaves a partially consumed line at its outstanding fraction', () => {
    const allocations = allocateConsumption(
      [line('111', '2026-01-01', { kcal: 100, protein: 10 }, 2)],
      [event('111', 1, '2026-01-05')],
    );
    const [group] = groupPantry(allocations);
    expect(group?.outstandingQuantity).toBe(1);
    expect(group?.outstandingMacros.kcal).toBe(50);
  });

  it('excludes a product opted out via excludedEans', () => {
    const allocations = allocateConsumption(
      [line('111', '2026-03-01', { kcal: 100 })],
      [],
    );
    expect(groupPantry(allocations, new Set(['111']))).toEqual([]);
  });
});

describe('pantryStock', () => {
  it('divides remaining protein by the account’s own daily rate', () => {
    const allocations = allocateConsumption(
      [line('111', '2026-03-01', { kcal: 1000, protein: 100 })],
      [],
    );
    const groups = groupPantry(allocations);
    expect(pantryStock(groups, 20).proteinDays).toBeCloseTo(5, 6);
  });

  it('reports null protein days rather than dividing by a zero rate', () => {
    const allocations = allocateConsumption(
      [line('111', '2026-03-01', { protein: 50 })],
      [],
    );
    const groups = groupPantry(allocations);
    expect(pantryStock(groups, 0).proteinDays).toBeNull();
  });

  it('excludes fully consumed products from the shelf count', () => {
    const allocations = allocateConsumption(
      [line('111', '2026-01-01', { kcal: 100 })],
      [event('111', 1, '2026-01-05')],
    );
    const groups = groupPantry(allocations);
    expect(pantryStock(groups, 10).products).toBe(0);
  });
});
