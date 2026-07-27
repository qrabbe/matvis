import { describe, expect, it } from 'bun:test';
import {
  eachDay,
  inRange,
  normalizeRange,
  precedingRange,
  presetRange,
  rangeLengthDays,
  shiftDays,
} from '../../src/lib/dateRange';

describe('shiftDays', () => {
  it('crosses month and year boundaries', () => {
    expect(shiftDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('leaves a malformed key alone', () => {
    expect(shiftDays('not-a-day', 5)).toBe('not-a-day');
  });
});

describe('rangeLengthDays', () => {
  it('counts both ends', () => {
    expect(rangeLengthDays({ from: '2026-03-01', to: '2026-03-01' })).toBe(1);
    expect(rangeLengthDays({ from: '2026-03-01', to: '2026-03-30' })).toBe(30);
  });
});

describe('presetRange', () => {
  const today = new Date(2026, 6, 26); // 2026-07-26

  it('counts today as the first day of the window', () => {
    expect(presetRange('30d', today)).toEqual({
      from: '2026-06-27',
      to: '2026-07-26',
    });
  });

  it('clamps to the earliest day the account has', () => {
    // A 1-year window over three months of receipts would otherwise draw nine
    // empty months.
    expect(presetRange('1y', today, '2026-05-01')).toEqual({
      from: '2026-05-01',
      to: '2026-07-26',
    });
  });

  it('does not clamp when the data is older than the window', () => {
    expect(presetRange('30d', today, '2020-01-01').from).toBe('2026-06-27');
  });

  it('resolves "all" against the data', () => {
    expect(presetRange('all', today, '2024-02-03')).toEqual({
      from: '2024-02-03',
      to: '2026-07-26',
    });
  });
});

describe('precedingRange', () => {
  it('is the equal-length window immediately before', () => {
    expect(precedingRange({ from: '2026-03-11', to: '2026-03-20' })).toEqual({
      from: '2026-03-01',
      to: '2026-03-10',
    });
  });

  it('never overlaps the range it precedes', () => {
    const range = { from: '2026-03-01', to: '2026-03-31' };
    const before = precedingRange(range);
    expect(before.to < range.from).toBe(true);
    expect(rangeLengthDays(before)).toBe(rangeLengthDays(range));
  });
});

describe('inRange', () => {
  it('includes both ends', () => {
    const range = { from: '2026-03-01', to: '2026-03-31' };
    expect(inRange('2026-03-01', range)).toBe(true);
    expect(inRange('2026-03-31', range)).toBe(true);
    expect(inRange('2026-02-28', range)).toBe(false);
    expect(inRange('2026-04-01', range)).toBe(false);
  });

  it('matches nothing when an end does not parse', () => {
    // An empty "from" would otherwise compare true for every day in history.
    expect(inRange('2026-03-01', { from: '', to: '2026-03-31' })).toBe(false);
    expect(inRange('2026-03-01', { from: '2026-03-01', to: '2026-0' })).toBe(
      false,
    );
  });
});

describe('eachDay', () => {
  it('emits every day including the empty ones', () => {
    expect(eachDay({ from: '2026-02-27', to: '2026-03-02' })).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });

  it('is empty for an inverted range', () => {
    expect(eachDay({ from: '2026-03-05', to: '2026-03-01' })).toEqual([]);
  });
});

describe('normalizeRange', () => {
  it('swaps an inverted range rather than rejecting it', () => {
    expect(normalizeRange({ from: '2026-03-31', to: '2026-03-01' })).toEqual({
      from: '2026-03-01',
      to: '2026-03-31',
    });
  });

  it('collapses to the good end when the other does not parse', () => {
    expect(normalizeRange({ from: '2026-0', to: '2026-03-01' })).toEqual({
      from: '2026-03-01',
      to: '2026-03-01',
    });
    expect(normalizeRange({ from: '2026-03-01', to: '' })).toEqual({
      from: '2026-03-01',
      to: '2026-03-01',
    });
  });

  it('falls back to today when neither end parses', () => {
    expect(normalizeRange({ from: '', to: '' }, new Date(2026, 6, 26))).toEqual(
      {
        from: '2026-07-26',
        to: '2026-07-26',
      },
    );
  });
});
