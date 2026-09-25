import { describe, expect, it } from 'bun:test';
import type { CatalogRow, ReceiptHeader, ReceiptItemDoc } from '@matvis/shared';
import {
  expandLineToUnits,
  expandLinesToUnits,
  pantryGroupKey,
} from '../../src/lib/pantryUnits';
import type { PurchaseLine } from '../../src/lib/purchases';

function head(id = 'r1'): ReceiptHeader {
  return { _id: id as ReceiptHeader['_id'] } as ReceiptHeader;
}

function catalogProduct(ean: string): CatalogRow {
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

function line(overrides: Partial<ReceiptItemDoc> = {}): PurchaseLine {
  const item: ReceiptItemDoc = {
    _id: 'item_1' as ReceiptItemDoc['_id'],
    _creationTime: 0,
    receiptId: 'r1' as ReceiptItemDoc['receiptId'],
    lineNo: 3,
    text: 'DEMAE RAMEN KYCKLI 51,80',
    price: 51.8,
    isDiscount: false,
    ...overrides,
  };
  return {
    item,
    header: head(),
    day: '2026-09-18',
    purchasedAt: new Date('2026-09-18T17:00:00Z'),
    product: item.gtin ? catalogProduct(item.gtin) : null,
    macros: null,
  };
}

describe('expandLineToUnits', () => {
  it('expands an "xN st" count line into N separate units', () => {
    const units = expandLineToUnits(line({ quantity: 5, unit: 'st' }));
    expect(units).toHaveLength(5);
    expect(units.map((u) => u.unitIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(units.every((u) => u.quantity === 1 && u.weightUnit === null)).toBe(
      true,
    );
    expect(units[0]?.key).toBe('r1:3:0');
    expect(units[4]?.key).toBe('r1:3:4');
  });

  it('keeps a weighed lot as one unit carrying the weight', () => {
    const units = expandLineToUnits(line({ quantity: 0.782, unit: 'kg' }));
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ quantity: 0.782, weightUnit: 'kg' });
  });

  it('is one plain unit when there is no quantity line at all (a multipack scans as one price)', () => {
    const units = expandLineToUnits(line());
    expect(units).toHaveLength(1);
    expect(units[0]).toMatchObject({ quantity: 1, weightUnit: null });
  });

  it('does not expand a single count of one', () => {
    const units = expandLineToUnits(line({ quantity: 1, unit: 'st' }));
    expect(units).toHaveLength(1);
    expect(units[0]?.weightUnit).toBeNull();
  });

  it('skips discount lines entirely when expanding a whole receipt', () => {
    const units = expandLinesToUnits([
      line({ lineNo: 1, text: 'MJÖLK', price: 15.95 }),
      line({ lineNo: 2, text: 'RABATT', price: -5, isDiscount: true }),
    ]);
    expect(units).toHaveLength(1);
  });

  it('gives every unit a key unique across lines and receipts', () => {
    const units = expandLinesToUnits([
      line({ lineNo: 1, quantity: 2, unit: 'st' }),
      line({ lineNo: 2 }),
    ]);
    const keys = new Set(units.map((u) => u.key));
    expect(keys.size).toBe(units.length);
  });
});

describe('pantryGroupKey', () => {
  it('groups a product by gtin', () => {
    const [unit] = expandLineToUnits(
      line({ gtin: '7310865004703', kind: 'product' }),
    );
    expect(pantryGroupKey(unit!)).toBe('product:7310865004703');
  });

  it('groups loose produce by its own normalized text, not a gtin', () => {
    const [unit] = expandLineToUnits(
      line({ text: 'TOMATER KVIST KG SVE 30,31', kind: 'produce' }),
    );
    expect(pantryGroupKey(unit!)).toBe('produce:tomater kvist kg sve');
  });

  it('is null for notFood, notInCatalog, and unidentified lines — never a tile', () => {
    for (const kind of ['notFood', 'notInCatalog', undefined] as const) {
      const [unit] = expandLineToUnits(line({ kind }));
      expect(pantryGroupKey(unit!)).toBeNull();
    }
  });

  it('is null for a product-kind line missing its gtin (should not happen, but never silently groups)', () => {
    const [unit] = expandLineToUnits(
      line({ kind: 'product', gtin: undefined }),
    );
    expect(pantryGroupKey(unit!)).toBeNull();
  });
});
