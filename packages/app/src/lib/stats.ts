import type { ReceiptHeader } from '@matvis/shared';
import { dayKey } from './format';
import { inRange, type DateRange } from './dateRange';
import { receiptDate } from './purchases';

export interface DailySpend {
  day: string;
  total: number;
  receipts: number;
}

export interface HeadlineStats {
  receipts: number;
  items: number;
  spend: number;
  averageBasket: number;
  discounts: number;
  firstDay: string | null;
  lastDay: string | null;
}

export function headersInRange(
  headers: readonly ReceiptHeader[],
  range: DateRange,
): ReceiptHeader[] {
  return headers.filter((header) =>
    inRange(dayKey(receiptDate(header)), range),
  );
}

export function headlineStats(
  headers: readonly ReceiptHeader[],
): HeadlineStats {
  let spend = 0;
  let items = 0;
  let discounts = 0;
  let firstDay: string | null = null;
  let lastDay: string | null = null;

  for (const header of headers) {
    spend += header.total ?? 0;
    items += header.itemCount ?? 0;
    discounts += Math.abs(header.discountsTotal ?? 0);
    const day = dayKey(receiptDate(header));
    if (firstDay === null || day < firstDay) firstDay = day;
    if (lastDay === null || day > lastDay) lastDay = day;
  }

  return {
    receipts: headers.length,
    items,
    spend,
    averageBasket: headers.length > 0 ? spend / headers.length : 0,
    discounts,
    firstDay,
    lastDay,
  };
}

export function dailySpend(
  headers: readonly ReceiptHeader[],
): Map<string, DailySpend> {
  const out = new Map<string, DailySpend>();
  for (const header of headers) {
    const day = dayKey(receiptDate(header));
    const entry = out.get(day) ?? { day, total: 0, receipts: 0 };
    entry.total += header.total ?? 0;
    entry.receipts += 1;
    out.set(day, entry);
  }
  return out;
}

export interface MonthlySpend {
  month: string;
  total: number;
  receipts: number;
}

export function monthlySpend(
  headers: readonly ReceiptHeader[],
): MonthlySpend[] {
  const byMonth = new Map<string, MonthlySpend>();
  for (const header of headers) {
    const month = dayKey(receiptDate(header)).slice(0, 7);
    const entry = byMonth.get(month) ?? { month, total: 0, receipts: 0 };
    entry.total += header.total ?? 0;
    entry.receipts += 1;
    byMonth.set(month, entry);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function relativeChange(
  current: number,
  previous: number,
): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}
