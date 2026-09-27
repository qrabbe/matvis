import { describe, expect, it } from 'bun:test';
import {
  currentPeriod,
  isLatestPeriod,
  periodLabel,
  periodRange,
  shiftPeriod,
} from '../../src/lib/period';

const today = new Date(2026, 8, 25); // Friday, 2026-09-25

describe('periodRange', () => {
  it('gives the Monday-to-Sunday week, clipped at today', () => {
    expect(periodRange(currentPeriod('week', today), today)).toEqual({
      from: '2026-09-21',
      to: '2026-09-25',
    });
  });

  it('does not clip a past, fully-elapsed week', () => {
    const lastWeek = shiftPeriod(currentPeriod('week', today), -1);
    expect(periodRange(lastWeek, today)).toEqual({
      from: '2026-09-14',
      to: '2026-09-20',
    });
  });

  it('gives the calendar month, clipped at today', () => {
    expect(periodRange(currentPeriod('month', today), today)).toEqual({
      from: '2026-09-01',
      to: '2026-09-25',
    });
  });

  it('gives the calendar year, clipped at today', () => {
    expect(periodRange(currentPeriod('year', today), today)).toEqual({
      from: '2026-01-01',
      to: '2026-09-25',
    });
  });
});

describe('shiftPeriod', () => {
  it('moves a week by seven days', () => {
    expect(shiftPeriod({ unit: 'week', anchor: '2026-09-21' }, 1)).toEqual({
      unit: 'week',
      anchor: '2026-09-28',
    });
  });

  it('moves a month across a year boundary', () => {
    const dec = { unit: 'month' as const, anchor: '2025-12-15' };
    expect(shiftPeriod(dec, 1)).toEqual({
      unit: 'month',
      anchor: '2026-01-01',
    });
  });

  it('moves a year back', () => {
    expect(shiftPeriod({ unit: 'year', anchor: '2026-06-01' }, -1)).toEqual({
      unit: 'year',
      anchor: '2025-01-01',
    });
  });
});

describe('isLatestPeriod', () => {
  it('is true for the period containing today, false otherwise', () => {
    expect(isLatestPeriod(currentPeriod('week', today), today)).toBe(true);
    const lastWeek = shiftPeriod(currentPeriod('week', today), -1);
    expect(isLatestPeriod(lastWeek, today)).toBe(false);
  });
});

describe('periodLabel', () => {
  it('names the nominal calendar span, not the clipped data range', () => {
    expect(periodLabel(currentPeriod('week', today))).toBe(
      '21.09 – 27.09.2026',
    );
    expect(periodLabel(currentPeriod('month', today))).toBe('September 2026');
    expect(periodLabel(currentPeriod('year', today))).toBe('2026');
  });
});
