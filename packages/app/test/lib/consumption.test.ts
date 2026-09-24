import { describe, expect, it } from 'bun:test';
import type { CatalogRow, ReceiptHeader, ReceiptItemDoc } from '@matvis/shared';
import {
  allocateConsumption,
  spreadSpanByDay,
  totalConsumedMacros,
  type ConsumptionEvent,
} from '../../src/lib/consumption';
import { ZERO_MACROS, type Macros } from '../../src/lib/nutrition';
import type { PurchaseLine } from '../../src/lib/purchases';

function product(ean: string): CatalogRow {
  return {
    _id: `catalog_${ean}` as CatalogRow['_id'],
    _creationTime: 0,
    ean,
    name: `Product ${ean}`,
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
  hasProduct = true,
): PurchaseLine {
  return {
    item: {
      _id: `${ean}-${day}` as ReceiptItemDoc['_id'],
      _creationTime: 0,
      receiptId: 'r1' as ReceiptItemDoc['receiptId'],
      lineNo: 1,
      text: `LINE ${ean}`,
      price: 20,
      isDiscount: false,
      quantity,
    },
    header: {} as ReceiptHeader,
    day,
    purchasedAt: new Date(`${day}T12:00:00`),
    product: hasProduct ? product(ean) : null,
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

describe('allocateConsumption', () => {
  it('leaves a line fully outstanding with no matching events', () => {
    const [alloc] = allocateConsumption(
      [line('111', '2026-01-01', { kcal: 100 })],
      [],
    );
    expect(alloc?.outstandingQuantity).toBe(1);
    expect(alloc?.spans).toEqual([]);
  });

  it('depletes the oldest purchase line first (FIFO)', () => {
    const jan = line('111', '2026-01-01', { kcal: 100 }, 1);
    const feb = line('111', '2026-02-01', { kcal: 100 }, 1);
    const allocations = allocateConsumption(
      [feb, jan],
      [event('111', 1, '2026-02-15')],
    );

    const janAlloc = allocations.find((a) => a.line === jan)!;
    const febAlloc = allocations.find((a) => a.line === feb)!;
    expect(janAlloc.outstandingQuantity).toBe(0);
    expect(febAlloc.outstandingQuantity).toBe(1);
    expect(janAlloc.spans).toHaveLength(1);
    expect(janAlloc.spans[0]?.quantity).toBe(1);
  });

  it('splits one event across two purchase lines when the first cannot cover it', () => {
    const jan = line('111', '2026-01-01', { kcal: 100 }, 1);
    const feb = line('111', '2026-02-01', { kcal: 100 }, 1);
    const allocations = allocateConsumption(
      [jan, feb],
      [event('111', 2, '2026-02-15')],
    );

    const janAlloc = allocations.find((a) => a.line === jan)!;
    const febAlloc = allocations.find((a) => a.line === feb)!;
    expect(janAlloc.outstandingQuantity).toBe(0);
    expect(febAlloc.outstandingQuantity).toBe(0);
  });

  it('leaves an event unallocated past what was ever purchased, without throwing', () => {
    const allocations = allocateConsumption(
      [line('111', '2026-01-01', { kcal: 100 }, 1)],
      [event('111', 5, '2026-01-10')],
    );
    expect(allocations[0]?.outstandingQuantity).toBe(0);
    expect(allocations[0]?.spans).toHaveLength(1);
    expect(allocations[0]?.spans[0]?.quantity).toBe(1);
  });

  it('ignores an event for a product never purchased', () => {
    const allocations = allocateConsumption(
      [line('111', '2026-01-01', { kcal: 100 })],
      [event('999', 1, '2026-01-10')],
    );
    expect(allocations[0]?.outstandingQuantity).toBe(1);
  });

  it('skips lines with no resolved product', () => {
    const allocations = allocateConsumption(
      [line('111', '2026-01-01', { kcal: 100 }, 1, false)],
      [event('111', 1, '2026-01-10')],
    );
    expect(allocations[0]?.outstandingQuantity).toBe(1);
    expect(allocations[0]?.spans).toEqual([]);
  });
});

describe('spreadSpanByDay', () => {
  it('spreads a same-day span onto a single day', () => {
    const shares = spreadSpanByDay({
      quantity: 1,
      from: new Date('2026-03-01T10:00:00'),
      to: new Date('2026-03-01T18:00:00'),
      macros: { ...ZERO_MACROS, kcal: 200 },
    });
    expect(shares).toHaveLength(1);
    expect(shares[0]?.day).toBe('2026-03-01');
    expect(shares[0]?.macros.kcal).toBe(200);
  });

  it('spreads a two-week gap between purchase and consumption evenly', () => {
    const shares = spreadSpanByDay({
      quantity: 1,
      from: new Date('2026-03-01T12:00:00'),
      to: new Date('2026-03-14T12:00:00'),
      macros: { ...ZERO_MACROS, kcal: 1400 },
    });
    expect(shares).toHaveLength(14);
    expect(shares[0]?.macros.kcal).toBe(100);
    expect(shares[13]?.day).toBe('2026-03-14');
  });
});

describe('totalConsumedMacros', () => {
  it('sums macros across every span, ignoring outstanding quantity', () => {
    const allocations = allocateConsumption(
      [line('111', '2026-01-01', { kcal: 100 }, 2)],
      [event('111', 1, '2026-01-05')],
    );
    expect(totalConsumedMacros(allocations).kcal).toBe(50);
  });
});
