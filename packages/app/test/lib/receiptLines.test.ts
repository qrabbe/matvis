import { describe, expect, it } from 'bun:test';
import type { ReceiptHeader, ReceiptItemDoc } from '@matvis/shared';
import { foldDiscounts } from '../../src/lib/receiptLines';
import type { PurchaseLine } from '../../src/lib/purchases';

function line(lineNo: number, price: number, isDiscount = false): PurchaseLine {
  const item: ReceiptItemDoc = {
    _id: `i${lineNo}` as ReceiptItemDoc['_id'],
    _creationTime: 0,
    receiptId: 'r1' as ReceiptItemDoc['receiptId'],
    lineNo,
    text: isDiscount ? 'RABATT' : `LINE ${lineNo}`,
    price,
    isDiscount,
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

describe('foldDiscounts', () => {
  it('folds a discount into the net price of the line right before it', () => {
    const folded = foldDiscounts([line(0, 33, false), line(1, -2.5, true)]);
    expect(folded).toHaveLength(1);
    expect(folded[0]?.netPrice).toBe(30.5);
  });

  it('leaves an undiscounted line at its own price', () => {
    const folded = foldDiscounts([line(0, 15.95, false)]);
    expect(folded[0]?.netPrice).toBe(15.95);
  });

  it('sorts by lineNo before folding, regardless of input order', () => {
    const folded = foldDiscounts([line(1, -2.5, true), line(0, 33, false)]);
    expect(folded).toHaveLength(1);
    expect(folded[0]?.netPrice).toBe(30.5);
  });

  it('drops a leading discount with nothing before it to attach to', () => {
    const folded = foldDiscounts([line(0, -5, true), line(1, 10, false)]);
    expect(folded).toHaveLength(1);
    expect(folded[0]?.netPrice).toBe(10);
  });

  it('handles several items each with their own discount', () => {
    const folded = foldDiscounts([
      line(0, 20, false),
      line(1, -2, true),
      line(2, 30, false),
      line(3, -3, true),
    ]);
    expect(folded.map((f) => f.netPrice)).toEqual([18, 27]);
  });
});
