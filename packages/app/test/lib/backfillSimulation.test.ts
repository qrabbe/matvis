import { describe, expect, it } from 'bun:test';
import type { CatalogRow, ReceiptHeader, ReceiptItemDoc } from '@matvis/shared';
import {
  simulateBackfill,
  simulateGroupBackfill,
} from '../../src/lib/backfillSimulation';
import { expandLineToUnits } from '../../src/lib/pantryUnits';
import type { PurchaseLine } from '../../src/lib/purchases';

let seq = 0;

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

function line(
  gtin: string,
  purchasedAt: string,
  overrides: Partial<ReceiptItemDoc> = {},
): PurchaseLine {
  seq += 1;
  const item: ReceiptItemDoc = {
    _id: `item_${seq}` as ReceiptItemDoc['_id'],
    _creationTime: 0,
    receiptId: `receipt_${seq}` as ReceiptItemDoc['receiptId'],
    lineNo: 0,
    text: `LINE ${gtin}`,
    price: 20,
    isDiscount: false,
    gtin,
    kind: 'product',
    ...overrides,
  };
  return {
    item,
    header: { _id: item.receiptId } as ReceiptHeader,
    day: purchasedAt.slice(0, 10),
    purchasedAt: new Date(purchasedAt),
    product: catalogProduct(gtin),
    macros: null,
  };
}

const day = (n: number) => new Date(2026, 0, 1 + n).getTime();

describe('simulateGroupBackfill', () => {
  it('finishes a single unit bought and estimated to be long gone by tracking start', () => {
    const [unit] = expandLineToUnits(line('a', '2026-01-01T00:00:00'));
    const { toFinish, stillInPantryKeys } = simulateGroupBackfill(
      [unit!],
      { daysToFinish: 3 },
      day(30),
    );
    expect(toFinish).toHaveLength(1);
    expect(stillInPantryKeys).toEqual([]);
  });

  it('leaves a unit in the pantry when its estimated finish is at or after tracking start', () => {
    const [unit] = expandLineToUnits(line('a', '2026-01-29T00:00:00'));
    const { toFinish, stillInPantryKeys } = simulateGroupBackfill(
      [unit!],
      { daysToFinish: 3 },
      day(30),
    );
    expect(toFinish).toEqual([]);
    expect(stillInPantryKeys).toEqual([unit!.key]);
  });

  it('does not pile up a backlog when the estimate is longer than the real buying cadence (the milk bug)', () => {
    // Bought every 2.5 days for 60 days — ~24 purchases — but the estimate
    // is wrongly generous at 4 days. Naive FIFO queueing at 4 days/unit
    // would leave many units still "in the queue" by day 60. Own pace
    // (2.5 days, well under 2x the 4-day estimate) should be used instead,
    // and the queue should clear roughly as fast as it fills.
    const units = [];
    for (let i = 0; i < 24; i++) {
      const purchasedAt = new Date(2026, 0, 1 + i * 2.5).toISOString();
      units.push(expandLineToUnits(line('milk', purchasedAt))[0]!);
    }
    const trackingStart = new Date(2026, 0, 1 + 24 * 2.5).getTime();
    const { toFinish, stillInPantryKeys } = simulateGroupBackfill(
      units,
      { daysToFinish: 4 },
      trackingStart,
    );
    // A believable pantry: at most a couple of very recent cartons left,
    // not dozens.
    expect(stillInPantryKeys.length).toBeLessThanOrEqual(3);
    expect(toFinish.length).toBeGreaterThan(20);
  });

  it('caps own pace at twice the estimate, so a rarely-bought perishable does not inherit a meaningless cadence', () => {
    // Hummus bought every 85 days (rare, but that's shopping rhythm, not
    // shelf life) — a 3-day estimate should cap the effective duration at
    // 6 days, not let 85-day gaps become "how long hummus lasts".
    const units = [0, 85, 170].map(
      (offset) =>
        expandLineToUnits(
          line('hummus', new Date(2026, 0, 1 + offset).toISOString()),
        )[0]!,
    );
    const trackingStart = new Date(2026, 0, 1 + 170 + 10).getTime();
    const { toFinish } = simulateGroupBackfill(
      units,
      { daysToFinish: 3 },
      trackingStart,
    );
    // Each unit's own span is capped at 6 days (2x the 3-day estimate), so
    // start ≈ purchase date for every unit (no backlog possible at an
    // 85-day cadence) and each finishes 6 days after its own purchase.
    expect(toFinish).toHaveLength(3);
    for (const mark of toFinish) {
      expect(mark.finishedAt - mark.startedAt).toBe(6 * 86_400_000);
    }
  });

  it('never estimates past the shelf-life cap', () => {
    const units = [0, 40, 80].map(
      (offset) =>
        expandLineToUnits(
          line('lime-juice', new Date(2026, 0, 1 + offset).toISOString()),
        )[0]!,
    );
    const trackingStart = new Date(2026, 0, 1 + 80 + 5).getTime();
    const { toFinish } = simulateGroupBackfill(
      units,
      { daysToFinish: 365, maxDaysFromPurchase: 60 },
      trackingStart,
    );
    for (const mark of toFinish) {
      expect(mark.finishedAt - mark.startedAt).toBeLessThanOrEqual(
        60 * 86_400_000,
      );
    }
  });
});

describe('simulateBackfill', () => {
  it('runs every product group independently and only returns units gone before tracking start', () => {
    const lines = [
      line('a', '2026-01-01T00:00:00'), // long gone by day 30
      line('b', '2026-01-29T00:00:00'), // still fresh at day 30
    ];
    const marks = simulateBackfill(
      lines,
      new Map([
        ['product:a', { daysToFinish: 2 }],
        ['product:b', { daysToFinish: 2 }],
      ]),
      day(30),
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]?.receiptId).toBe(lines[0]!.header._id);
  });

  it('falls back to the flat default duration for a group with no estimate', () => {
    const lines = [line('unknown', '2026-01-01T00:00:00')];
    const marks = simulateBackfill(lines, new Map(), day(30), 5);
    expect(marks).toHaveLength(1);
  });

  it('never touches a notFood or unidentified line — it has no group key', () => {
    const lines = [
      line('a', '2026-01-01T00:00:00', { kind: 'notFood', gtin: undefined }),
      line('a', '2026-01-01T00:00:00', { kind: undefined, gtin: undefined }),
    ];
    const marks = simulateBackfill(lines, new Map(), day(30));
    expect(marks).toEqual([]);
  });
});
