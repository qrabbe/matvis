import { describe, expect, it } from 'bun:test';
import {
  forecastByDay,
  markedIntakeByDay,
  proteinSources,
  wasteSummary,
} from '../../src/lib/intake';
import { expandLineToUnits, type PantryUnit } from '../../src/lib/pantryUnits';
import { ZERO_MACROS } from '../../src/lib/nutrition';
import type { MarkRow } from '../../src/lib/appBackendApi';
import type { CatalogRow, ReceiptHeader, ReceiptItemDoc } from '@matvis/shared';
import type { PurchaseLine } from '../../src/lib/purchases';

function catalogProduct(ean: string, name: string): CatalogRow {
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

let lineSeq = 0;

function line(
  gtin: string,
  name: string,
  macrosKcal: number,
  proteinG: number,
  price = 20,
): PurchaseLine {
  lineSeq += 1;
  const item: ReceiptItemDoc = {
    _id: `item_${gtin}` as ReceiptItemDoc['_id'],
    _creationTime: 0,
    receiptId: 'r1' as ReceiptItemDoc['receiptId'],
    lineNo: lineSeq,
    text: name,
    price,
    isDiscount: false,
    gtin,
    kind: 'product',
  };
  return {
    item,
    header: { _id: 'r1' } as ReceiptHeader,
    day: '2026-09-01',
    purchasedAt: new Date('2026-09-01T00:00:00Z'),
    product: catalogProduct(gtin, name),
    macros: { ...ZERO_MACROS, kcal: macrosKcal, protein: proteinG },
  };
}

function mark(
  unit: PantryUnit,
  finishedAt: string,
  outcome: 'finished' | 'wasted' = 'finished',
): MarkRow {
  return {
    _id: 'm1',
    _creationTime: 0,
    receiptId: unit.receiptId,
    lineNo: unit.lineNo,
    unitIndex: unit.unitIndex,
    outcome,
    finishedAt: Date.parse(finishedAt),
    finishedAtHandSet: false,
    via: 'tap',
  };
}

describe('markedIntakeByDay', () => {
  it('spreads a one-day span onto that single day', () => {
    const [unit] = expandLineToUnits(line('a', 'Milk', 200, 10));
    const m = mark(unit!, '2026-09-01T12:00:00Z');
    const days = markedIntakeByDay([m], new Map([[unit!.key, unit!]]));
    expect(days).toHaveLength(1);
    expect(days[0]?.macros.kcal).toBe(200);
  });

  it('spreads across several days evenly', () => {
    const [unit] = expandLineToUnits(line('a', 'Rice', 1000, 20));
    const m: MarkRow = {
      ...mark(unit!, '2026-09-05T00:00:00Z'),
      startedAt: Date.parse('2026-09-01T00:00:00Z'),
    };
    const days = markedIntakeByDay([m], new Map([[unit!.key, unit!]]));
    expect(days).toHaveLength(5);
    for (const d of days) expect(d.macros.kcal).toBe(200);
  });

  it('ignores a wasted unit — never eaten', () => {
    const [unit] = expandLineToUnits(line('a', 'Milk', 200, 10));
    const m = mark(unit!, '2026-09-01T12:00:00Z', 'wasted');
    expect(markedIntakeByDay([m], new Map([[unit!.key, unit!]]))).toEqual([]);
  });
});

describe('forecastByDay', () => {
  it('spreads remaining macros from today to the expected finish date', () => {
    const [unit] = expandLineToUnits(line('a', 'Oats', 700, 10));
    const days = forecastByDay(
      [unit!],
      () => 7,
      new Date('2026-09-25T00:00:00Z'),
    );
    expect(days).toHaveLength(8); // today through +7 days, inclusive
    for (const d of days) expect(d.macros.kcal).toBeCloseTo(87.5, 5);
  });
});

describe('proteinSources', () => {
  it('ranks products by total protein contributed in the range', () => {
    const [milk] = expandLineToUnits(line('a', 'Milk', 200, 10));
    const [eggs] = expandLineToUnits(line('b', 'Eggs', 300, 30));
    const marks = [
      mark(milk!, '2026-09-20T00:00:00Z'),
      mark(eggs!, '2026-09-21T00:00:00Z'),
    ];
    const unitsByKey = new Map([
      [milk!.key, milk!],
      [eggs!.key, eggs!],
    ]);
    const sources = proteinSources(
      marks,
      unitsByKey,
      '2026-09-18',
      '2026-09-25',
    );
    expect(sources[0]?.name).toBe('Eggs');
    expect(sources[1]?.name).toBe('Milk');
  });

  it('excludes marks outside the range', () => {
    const [milk] = expandLineToUnits(line('a', 'Milk', 200, 10));
    const marks = [mark(milk!, '2026-01-01T00:00:00Z')];
    const sources = proteinSources(
      marks,
      new Map([[milk!.key, milk!]]),
      '2026-09-18',
      '2026-09-25',
    );
    expect(sources).toEqual([]);
  });
});

describe('wasteSummary', () => {
  it('sums the purchase price of wasted units in range', () => {
    const [unit] = expandLineToUnits(line('a', 'Hummus', 100, 5, 30));
    const marks = [mark(unit!, '2026-09-20T00:00:00Z', 'wasted')];
    const summary = wasteSummary(
      marks,
      new Map([[unit!.key, unit!]]),
      '2026-09-01',
      '2026-09-30',
    );
    expect(summary.kr).toBe(30);
    expect(summary.items).toEqual(['Hummus']);
  });

  it('never counts a finished (not wasted) unit', () => {
    const [unit] = expandLineToUnits(line('a', 'Hummus', 100, 5, 30));
    const marks = [mark(unit!, '2026-09-20T00:00:00Z', 'finished')];
    const summary = wasteSummary(
      marks,
      new Map([[unit!.key, unit!]]),
      '2026-09-01',
      '2026-09-30',
    );
    expect(summary.kr).toBe(0);
  });
});
