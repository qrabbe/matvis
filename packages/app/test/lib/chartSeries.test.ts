import { describe, expect, it } from 'bun:test';
import { dayAtIndex, daySeries } from '../../src/lib/chartSeries';
import { formatDayShort } from '../../src/lib/format';

const twoYears = { from: '2025-01-01', to: '2026-12-31' };

describe('daySeries', () => {
  it('emits every day in the range, empty ones included', () => {
    const series = daySeries({ from: '2026-03-01', to: '2026-03-04' }, () => 0);
    expect(series.map((point) => point.day)).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
    ]);
  });

  it('reads each value from the day key', () => {
    const values = new Map([['2026-03-02', 42]]);
    const series = daySeries(
      { from: '2026-03-01', to: '2026-03-03' },
      (day) => values.get(day) ?? 0,
    );
    expect(series.map((point) => point.value)).toEqual([0, 42, 0]);
  });

  it('carries a unique day key even where labels collide', () => {
    const series = daySeries(twoYears, () => 0);
    const days = series.map((point) => point.day);
    const labels = series.map((point) => point.label);
    expect(new Set(days).size).toBe(days.length);
    // The premise of the bug: the axis label omits the year, so a two-year
    // span has roughly two of every label.
    expect(new Set(labels).size).toBeLessThan(labels.length);
    expect(formatDayShort('2025-03-14')).toBe(formatDayShort('2026-03-14'));
  });
});

describe('dayAtIndex', () => {
  const series = daySeries(twoYears, () => 0);

  it('resolves the second of two days sharing a short label', () => {
    const first = series.findIndex((point) => point.day === '2025-03-14');
    const second = series.findIndex((point) => point.day === '2026-03-14');
    expect(series[first]?.label).toBe(series[second]?.label);
    // Matching by label returned the 2025 bar for both. By index they differ.
    expect(dayAtIndex(series, first)).toBe('2025-03-14');
    expect(dayAtIndex(series, second)).toBe('2026-03-14');
  });

  it('resolves both ends of the range', () => {
    expect(dayAtIndex(series, 0)).toBe('2025-01-01');
    expect(dayAtIndex(series, series.length - 1)).toBe('2026-12-31');
  });

  it('is null for a click that resolved to no bar', () => {
    expect(dayAtIndex(series, undefined)).toBeNull();
    expect(dayAtIndex(series, null)).toBeNull();
    expect(dayAtIndex(series, '')).toBeNull();
    expect(dayAtIndex(series, 1.5)).toBeNull();
    expect(dayAtIndex(series, series.length)).toBeNull();
  });
});
