import { describe, expect, it } from 'bun:test';
import type { ReceiptHeader } from '@matvis/shared';
import {
  dailySpend,
  headersInRange,
  headlineStats,
  monthlySpend,
  relativeChange,
} from '../../src/lib/stats';

function header(
  day: string,
  overrides: Partial<ReceiptHeader> = {},
): ReceiptHeader {
  return {
    _id: `receipt_${day}_${overrides.total ?? 0}` as ReceiptHeader['_id'],
    _creationTime: 0,
    connectionId: 'connection_1' as ReceiptHeader['connectionId'],
    accountId: 'account_1' as ReceiptHeader['accountId'],
    externalId: `ext-${day}`,
    schemaVersion: 1,
    source: 'coop',
    store: { name: 'Stora Coop' },
    currency: 'SEK',
    vat: [],
    purchasedAt: `${day}T12:00:00`,
    total: 100,
    itemCount: 5,
    ...overrides,
  } as ReceiptHeader;
}

describe('headlineStats', () => {
  it('sums spend, items and discounts and derives the average basket', () => {
    const stats = headlineStats([
      header('2026-03-01', { total: 100, itemCount: 5, discountsTotal: -10 }),
      header('2026-03-05', { total: 300, itemCount: 15, discountsTotal: -5 }),
    ]);
    expect(stats.receipts).toBe(2);
    expect(stats.spend).toBe(400);
    expect(stats.items).toBe(20);
    expect(stats.averageBasket).toBe(200);
    // Discounts are printed negative; the tile reads "saved", so it is a
    // positive magnitude by the time it leaves here.
    expect(stats.discounts).toBe(15);
  });

  it('reports the first and last day regardless of input order', () => {
    const stats = headlineStats([
      header('2026-03-20'),
      header('2026-01-02'),
      header('2026-02-11'),
    ]);
    expect(stats.firstDay).toBe('2026-01-02');
    expect(stats.lastDay).toBe('2026-03-20');
  });

  it('is all zeroes and null days for an empty account', () => {
    const stats = headlineStats([]);
    expect(stats.spend).toBe(0);
    expect(stats.averageBasket).toBe(0);
    expect(stats.firstDay).toBeNull();
  });

  it('treats a receipt with no printed total as zero rather than NaN', () => {
    const stats = headlineStats([header('2026-03-01', { total: undefined })]);
    expect(stats.spend).toBe(0);
    expect(Number.isNaN(stats.averageBasket)).toBe(false);
  });
});

describe('headersInRange', () => {
  it('filters on the purchase day, both ends inclusive', () => {
    const headers = [
      header('2026-02-28'),
      header('2026-03-01'),
      header('2026-03-31'),
      header('2026-04-01'),
    ];
    const inside = headersInRange(headers, {
      from: '2026-03-01',
      to: '2026-03-31',
    });
    expect(inside).toHaveLength(2);
  });
});

describe('dailySpend', () => {
  it('merges several receipts on one day', () => {
    const byDay = dailySpend([
      header('2026-03-01', { total: 100 }),
      header('2026-03-01', { total: 250 }),
      header('2026-03-02', { total: 40 }),
    ]);
    expect(byDay.get('2026-03-01')).toEqual({
      day: '2026-03-01',
      total: 350,
      receipts: 2,
    });
    expect(byDay.get('2026-03-02')?.receipts).toBe(1);
  });

  it('omits days with no purchase — the heatmap draws its own calendar', () => {
    const byDay = dailySpend([header('2026-03-01')]);
    expect(byDay.has('2026-03-02')).toBe(false);
  });
});

describe('monthlySpend', () => {
  it('buckets by calendar month, oldest first', () => {
    const months = monthlySpend([
      header('2026-03-20', { total: 50 }),
      header('2026-01-02', { total: 10 }),
      header('2026-03-01', { total: 20 }),
    ]);
    expect(months.map((month) => month.month)).toEqual(['2026-01', '2026-03']);
    expect(months[1]?.total).toBe(70);
    expect(months[1]?.receipts).toBe(2);
  });
});

describe('relativeChange', () => {
  it('is the signed fraction of the baseline', () => {
    expect(relativeChange(110, 100)).toBeCloseTo(0.1, 10);
    expect(relativeChange(50, 100)).toBeCloseTo(-0.5, 10);
  });

  // "+100%" against nothing is a meaningless number dressed up as a finding.
  it('is null with no baseline to compare against', () => {
    expect(relativeChange(100, 0)).toBeNull();
    expect(relativeChange(0, 0)).toBeNull();
  });
});
