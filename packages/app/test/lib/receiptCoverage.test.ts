import { describe, expect, it } from 'bun:test';
import type { ReceiptHeader, ReceiptItemDoc } from '@matvis/shared';
import { krCoverage, krCoveragePercent } from '../../src/lib/receiptCoverage';
import type { PurchaseLine } from '../../src/lib/purchases';

function line(
  price: number,
  overrides: Partial<ReceiptItemDoc> = {},
): PurchaseLine {
  const item: ReceiptItemDoc = {
    _id: 'i' as ReceiptItemDoc['_id'],
    _creationTime: 0,
    receiptId: 'r1' as ReceiptItemDoc['receiptId'],
    lineNo: 0,
    text: 'LINE',
    price,
    isDiscount: false,
    ...overrides,
  };
  return {
    item,
    header: {} as ReceiptHeader,
    day: '2026-09-20',
    purchasedAt: new Date('2026-09-20'),
    product: null,
    macros: null,
  };
}

describe('krCoverage', () => {
  it('counts a product-kind line toward both identified and food spend', () => {
    const c = krCoverage([line(30, { kind: 'product', gtin: '1' })]);
    expect(c).toEqual({ identifiedKr: 30, foodKr: 30 });
  });

  it('counts produce and notInCatalog toward food spend but not identified', () => {
    const c = krCoverage([
      line(20, { kind: 'produce' }),
      line(15, { kind: 'notInCatalog' }),
    ]);
    expect(c).toEqual({ identifiedKr: 0, foodKr: 35 });
  });

  it('counts a fully unidentified line toward food spend but not identified', () => {
    const c = krCoverage([line(10, { kind: undefined })]);
    expect(c).toEqual({ identifiedKr: 0, foodKr: 10 });
  });

  it('excludes notFood and discount lines entirely', () => {
    const c = krCoverage([
      line(50, { kind: 'notFood' }),
      line(-5, { kind: 'product', gtin: '1', isDiscount: true }),
    ]);
    expect(c).toEqual({ identifiedKr: 0, foodKr: 0 });
  });
});

describe('krCoveragePercent', () => {
  it('is the identified fraction of food spend', () => {
    expect(krCoveragePercent({ identifiedKr: 88, foodKr: 100 })).toBeCloseTo(
      0.88,
    );
  });

  it('is null rather than dividing by zero for an account with no food spend yet', () => {
    expect(krCoveragePercent({ identifiedKr: 0, foodKr: 0 })).toBeNull();
  });
});
