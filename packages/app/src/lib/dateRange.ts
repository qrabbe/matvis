import { dayKey, parseDayKey } from './format';

/**
 * Date-range selection, shared by Nutrition and Stats. Ranges are INCLUSIVE of
 * both ends and expressed as `YYYY-MM-DD` day keys in local time — the same key
 * space every per-day aggregation uses, so a range and a bucket compare as
 * strings with no timezone arithmetic in between.
 */
export interface DateRange {
  /** First day, inclusive, e.g. `"2026-03-01"`. */
  from: string;
  /** Last day, inclusive. */
  to: string;
}

/** The presets the picker offers. `all` widens to whatever data exists. */
export type RangePresetId = '30d' | '90d' | '6m' | '1y' | 'all';

export const RANGE_PRESETS: { id: RangePresetId; label: string }[] = [
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: '6m', label: '6 months' },
  { id: '1y', label: '1 year' },
  { id: 'all', label: 'All' },
];

/** Days back each preset spans, counting today as day 1. `all` has no fixed
 * length — it is resolved against the data instead. */
const PRESET_DAYS: Record<Exclude<RangePresetId, 'all'>, number> = {
  '30d': 30,
  '90d': 90,
  '6m': 183,
  '1y': 365,
};

/** Shift a day key by `days` (negative goes back). Goes through `Date`, so it
 * crosses month, year and DST boundaries correctly. */
export function shiftDays(key: string, days: number): string {
  const date = parseDayKey(key);
  if (!date) return key;
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

/** Whole days from `from` to `to`, inclusive of both. Always at least 1. */
export function rangeLengthDays(range: DateRange): number {
  const from = parseDayKey(range.from);
  const to = parseDayKey(range.to);
  if (!from || !to) return 1;
  const ms = to.getTime() - from.getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/**
 * Resolve a preset against the data. `earliest` is the oldest day the account
 * has, used by `all` and as a floor for every other preset — a 1-year window
 * over three months of receipts would otherwise draw nine empty months and make
 * the chart unreadable.
 */
export function presetRange(
  preset: RangePresetId,
  today: Date = new Date(),
  earliest?: string,
): DateRange {
  const to = dayKey(today);
  if (preset === 'all') return { from: earliest ?? to, to };
  const from = shiftDays(to, -(PRESET_DAYS[preset] - 1));
  if (earliest && earliest > from) return { from: earliest, to };
  return { from, to };
}

/**
 * The range of equal length immediately BEFORE `range`, which is what a trend
 * compares against: 30 days against the 30 before them, not against a calendar
 * month of a different length.
 */
export function precedingRange(range: DateRange): DateRange {
  const length = rangeLengthDays(range);
  const to = shiftDays(range.from, -1);
  return { from: shiftDays(to, -(length - 1)), to };
}

/** Whether a day key falls inside an inclusive range. */
export function inRange(key: string, range: DateRange): boolean {
  return key >= range.from && key <= range.to;
}

/**
 * Every day key from `from` to `to` inclusive. Charts need the empty days too —
 * a bar chart drawn only over days that have data silently rescales its x-axis
 * and turns a gap into a dense week.
 */
export function eachDay(range: DateRange): string[] {
  const out: string[] = [];
  const start = parseDayKey(range.from);
  const end = parseDayKey(range.to);
  if (!start || !end || start > end) return out;
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Clamp a user-typed date input into a sane range, keeping `from <= to`. */
export function normalizeRange(range: DateRange): DateRange {
  if (!parseDayKey(range.from) || !parseDayKey(range.to)) return range;
  return range.from <= range.to ? range : { from: range.to, to: range.from };
}
