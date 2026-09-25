import { describe, expect, it } from 'bun:test';
import {
  finishedSpans,
  ownTypicalDuration,
  resolveTypicalDuration,
} from '../../src/lib/durations';
import type { MarkRow } from '../../src/lib/appBackendApi';
import type { PantryUnit } from '../../src/lib/pantryUnits';

function unit(overrides: Partial<PantryUnit> = {}): PantryUnit {
  return {
    key: 'r1:0:0',
    receiptId: 'r1',
    lineNo: 0,
    unitIndex: 0,
    line: {} as PantryUnit['line'],
    quantity: 1,
    weightUnit: null,
    purchasedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

function mark(overrides: Partial<MarkRow> = {}): MarkRow {
  return {
    _id: 'm1',
    _creationTime: 0,
    receiptId: 'r1',
    lineNo: 0,
    unitIndex: 0,
    outcome: 'finished',
    finishedAt: Date.parse('2026-09-10T00:00:00Z'),
    finishedAtHandSet: false,
    via: 'tap',
    ...overrides,
  };
}

describe('finishedSpans', () => {
  it('measures from the unit purchase date when no Started date was set', () => {
    const u = unit({
      key: 'r1:0:0',
      purchasedAt: new Date('2026-09-01T00:00:00Z'),
    });
    const spans = finishedSpans(
      [mark({ finishedAt: Date.parse('2026-09-06T00:00:00Z') })],
      new Map([[u.key, u]]),
      () => 'group-a',
    );
    expect(spans).toEqual([{ groupKey: 'group-a', days: 5, teaches: true }]);
  });

  it('measures from a hand-set Started date instead', () => {
    const u = unit();
    const spans = finishedSpans(
      [
        mark({
          startedAt: Date.parse('2026-09-05T00:00:00Z'),
          finishedAt: Date.parse('2026-09-10T00:00:00Z'),
        }),
      ],
      new Map([[u.key, u]]),
      () => 'group-a',
    );
    expect(spans[0]?.days).toBe(5);
  });

  it('ignores a wasted mark — it never taught anyone how long the product lasts', () => {
    const u = unit();
    const spans = finishedSpans(
      [mark({ outcome: 'wasted' })],
      new Map([[u.key, u]]),
      () => 'group-a',
    );
    expect(spans).toEqual([]);
  });

  it('a trip mark only teaches when its date was hand-set', () => {
    const u = unit();
    const bulk = finishedSpans(
      [mark({ via: 'trip', finishedAtHandSet: false })],
      new Map([[u.key, u]]),
      () => 'group-a',
    );
    expect(bulk[0]?.teaches).toBe(false);

    const corrected = finishedSpans(
      [mark({ via: 'trip', finishedAtHandSet: true })],
      new Map([[u.key, u]]),
      () => 'group-a',
    );
    expect(corrected[0]?.teaches).toBe(true);
  });

  it('drops a mark whose unit is not in the map, rather than throwing', () => {
    const spans = finishedSpans([mark()], new Map(), () => 'group-a');
    expect(spans).toEqual([]);
  });

  it('drops a mark whose unit has no group (unidentified)', () => {
    const u = unit();
    const spans = finishedSpans([mark()], new Map([[u.key, u]]), () => null);
    expect(spans).toEqual([]);
  });
});

describe('ownTypicalDuration', () => {
  it('is null with fewer than two teaching spans', () => {
    expect(
      ownTypicalDuration([{ groupKey: 'a', days: 5, teaches: true }], 'a'),
    ).toBeNull();
  });

  it('is the median of teaching spans for that group only', () => {
    const spans = [
      { groupKey: 'a', days: 3, teaches: true },
      { groupKey: 'a', days: 7, teaches: true },
      { groupKey: 'a', days: 5, teaches: true },
      { groupKey: 'b', days: 100, teaches: true },
    ];
    expect(ownTypicalDuration(spans, 'a')).toBe(5);
  });

  it('never counts a non-teaching span', () => {
    const spans = [
      { groupKey: 'a', days: 3, teaches: true },
      { groupKey: 'a', days: 999, teaches: false },
    ];
    expect(ownTypicalDuration(spans, 'a')).toBeNull();
  });
});

describe('resolveTypicalDuration', () => {
  const spans = [
    { groupKey: 'a', days: 3, teaches: true },
    { groupKey: 'a', days: 5, teaches: true },
  ];

  it('prefers the own-pace tier when it exists', () => {
    expect(resolveTypicalDuration(spans, 'a', 99, 50, 7)).toBe(4);
  });

  it('falls back to the estimate, then the category median, then the flat default', () => {
    expect(resolveTypicalDuration([], 'a', 12, 50, 7)).toBe(12);
    expect(resolveTypicalDuration([], 'a', undefined, 50, 7)).toBe(50);
    expect(resolveTypicalDuration([], 'a', undefined, undefined, 7)).toBe(7);
  });
});
