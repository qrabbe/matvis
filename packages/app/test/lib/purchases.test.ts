import { describe, expect, it } from 'bun:test';
import type { CatalogRow, ReceiptHeader, ReceiptItemDoc } from '@matvis/shared';
import {
  buildLines,
  computeCoverage,
  distinctGtins,
  pickProduct,
  receiptDate,
} from '../../src/lib/purchases';

function header(overrides: Partial<ReceiptHeader> = {}): ReceiptHeader {
  return {
    _id: 'receipt_1' as ReceiptHeader['_id'],
    _creationTime: new Date(2026, 0, 1).getTime(),
    connectionId: 'connection_1' as ReceiptHeader['connectionId'],
    accountId: 'account_1' as ReceiptHeader['accountId'],
    externalId: 'ext-1',
    schemaVersion: 1,
    source: 'coop',
    store: { name: 'Stora Coop' },
    currency: 'SEK',
    vat: [],
    purchasedAt: '2026-03-01T12:00:00.000Z',
    ...overrides,
  } as ReceiptHeader;
}

function item(overrides: Partial<ReceiptItemDoc> = {}): ReceiptItemDoc {
  return {
    _id: 'item_1' as ReceiptItemDoc['_id'],
    _creationTime: 0,
    receiptId: 'receipt_1' as ReceiptItemDoc['receiptId'],
    lineNo: 1,
    text: 'PESTO PEPERONICO 32,95',
    price: 32.95,
    isDiscount: false,
    ...overrides,
  };
}

function row(store: CatalogRow['store'], ean = '111'): CatalogRow {
  return {
    _id: `catalog_${store}` as CatalogRow['_id'],
    _creationTime: 0,
    ean,
    name: `${store} row`,
    store,
    sourceTable: `raw_${store}`,
    sourceId: 'raw_1',
  };
}

describe('receiptDate', () => {
  it('prefers the printed purchase timestamp', () => {
    expect(receiptDate(header()).toISOString()).toBe(
      '2026-03-01T12:00:00.000Z',
    );
  });

  it('falls back to the parsed epoch, then to the creation time', () => {
    const parsed = header({ purchasedAt: undefined, purchasedAtMs: 1000 });
    expect(receiptDate(parsed).getTime()).toBe(1000);

    const created = header({ purchasedAt: undefined });
    expect(created.getTime?.()).toBeUndefined();
    expect(receiptDate(created).getTime()).toBe(new Date(2026, 0, 1).getTime());
  });

  it('ignores an unparseable timestamp rather than producing an Invalid Date', () => {
    const broken = header({ purchasedAt: 'not a date', purchasedAtMs: 5000 });
    expect(receiptDate(broken).getTime()).toBe(5000);
  });
});

describe('pickProduct', () => {
  it('prefers the row from the store the receipt came from', () => {
    const rows = [row('ica'), row('coop')];
    expect(pickProduct(rows, 'coop')?.store).toBe('coop');
  });

  it('falls back to any row — a description is close enough across chains', () => {
    expect(pickProduct([row('ica')], 'coop')?.store).toBe('ica');
  });

  it('is null for no rows at all', () => {
    expect(pickProduct([], 'coop')).toBeNull();
    expect(pickProduct(undefined, 'coop')).toBeNull();
  });
});

describe('buildLines', () => {
  it('drops discount lines — they are a rebate, not a purchase', () => {
    const items = [
      item({ _id: 'a' as ReceiptItemDoc['_id'] }),
      item({
        _id: 'b' as ReceiptItemDoc['_id'],
        isDiscount: true,
        price: -5,
      }),
    ];
    const lines = buildLines(
      [header()],
      new Map([['receipt_1', items]]),
      new Map(),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.item._id).toBe('a');
  });

  it('skips receipts whose items have not hydrated yet', () => {
    expect(buildLines([header()], new Map(), new Map())).toEqual([]);
  });

  it('joins a matched line to its product and buckets it by local day', () => {
    const items = [item({ gtin: '111' })];
    const lines = buildLines(
      [header()],
      new Map([['receipt_1', items]]),
      new Map([['111', [row('coop')]]]),
    );
    expect(lines[0]?.product?.store).toBe('coop');
    expect(lines[0]?.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('leaves an unmatched line with no product and no macros', () => {
    const lines = buildLines(
      [header()],
      new Map([['receipt_1', [item()]]]),
      new Map(),
    );
    expect(lines[0]?.product).toBeNull();
    expect(lines[0]?.macros).toBeNull();
  });
});

describe('computeCoverage', () => {
  it('walks the funnel: total, matched, catalogued, then nutrition', () => {
    const items = [
      item({ _id: 'a' as ReceiptItemDoc['_id'] }), // unmatched
      item({ _id: 'b' as ReceiptItemDoc['_id'], gtin: '999' }), // matched, not catalogued
      item({ _id: 'c' as ReceiptItemDoc['_id'], gtin: '111' }), // catalogued, no nutrition
    ];
    const lines = buildLines(
      [header()],
      new Map([['receipt_1', items]]),
      new Map([['111', [row('coop')]]]),
    );
    expect(computeCoverage(lines)).toEqual({
      totalLines: 3,
      matchedLines: 2,
      catalogedLines: 1,
      noNutritionLines: 1,
      notScalableLines: 0,
      nutritionLines: 0,
    });
  });

  it('is all zeroes for no lines, which is a fresh account not an error', () => {
    expect(computeCoverage([]).totalLines).toBe(0);
  });
});

describe('distinctGtins', () => {
  it('dedupes across receipts and ignores discount lines', () => {
    const map = new Map([
      [
        'r1',
        [
          item({ gtin: '111' }),
          item({ gtin: '111' }),
          item({ gtin: '222', isDiscount: true }),
        ],
      ],
      ['r2', [item({ gtin: '333' })]],
    ]);
    expect(distinctGtins(map).sort()).toEqual(['111', '333']);
  });
});
