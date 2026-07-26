import type { ReceiptHeader } from './convexApi';
import { dayKey } from './format';
import { inRange, type DateRange } from './dateRange';
import { receiptDate } from './purchases';

/**
 * Header-derived aggregation: spend, baskets, discounts and the daily/monthly
 * rollups. Pure.
 *
 * Everything here reads receipt HEADERS only, which is why the Stats and
 * Activity tabs work fully today while the product-dependent ones wait on a
 * matching engine. `discountsTotal` in particular is already on the header, so
 * the discount number needs no line items at all.
 */

/** One day's spend, for the contribution heatmap and the spend chart. */
export interface DailySpend {
  /** `YYYY-MM-DD`, local time. */
  day: string;
  total: number;
  receipts: number;
}

/** Headline numbers for the Stats tiles. */
export interface HeadlineStats {
  receipts: number;
  items: number;
  spend: number;
  averageBasket: number;
  discounts: number;
  /** Oldest and newest purchase day in the set, or `null` when it is empty. */
  firstDay: string | null;
  lastDay: string | null;
}

/** Headers whose purchase day falls inside an inclusive range. */
export function headersInRange(
  headers: readonly ReceiptHeader[],
  range: DateRange,
): ReceiptHeader[] {
  return headers.filter((header) =>
    inRange(dayKey(receiptDate(header)), range),
  );
}

/**
 * Roll headers up into the headline tiles. `itemCount` is the count the receipt
 * itself printed (which already excludes discount lines), so this stays honest
 * even before any line item has been hydrated.
 */
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
    // Stored as printed, which is a negative number on a Coop receipt. The tile
    // reads "saved", so normalize to a positive magnitude here rather than in
    // the component.
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

/** Spend per day, keyed by day. Only days with a purchase appear — the heatmap
 * draws its own full calendar grid and looks days up in here. */
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

/** One month's spend, for the spend-by-month chart. */
export interface MonthlySpend {
  /** `YYYY-MM`. */
  month: string;
  total: number;
  receipts: number;
}

/** Spend per calendar month, oldest first. */
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

/**
 * Relative change from `previous` to `current`, or `null` when there is no
 * baseline to compare against. A trend against zero is not "+100%", it is "no
 * comparison", and saying so is more useful than an impressive-looking
 * meaningless number.
 */
export function relativeChange(
  current: number,
  previous: number,
): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}
