import { dayKey, parseDayKey } from './format';

export interface DateRange {
  from: string;
  to: string;
}

export type RangePresetId = '30d' | '90d' | '6m' | '1y' | 'all';

export const RANGE_PRESETS: { id: RangePresetId; label: string }[] = [
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: '6m', label: '6 months' },
  { id: '1y', label: '1 year' },
  { id: 'all', label: 'All' },
];

const PRESET_DAYS: Record<Exclude<RangePresetId, 'all'>, number> = {
  '30d': 30,
  '90d': 90,
  '6m': 183,
  '1y': 365,
};

export function shiftDays(key: string, days: number): string {
  const date = parseDayKey(key);
  if (!date) return key;
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

export function rangeLengthDays(range: DateRange): number {
  const from = parseDayKey(range.from);
  const to = parseDayKey(range.to);
  if (!from || !to) return 1;
  const ms = to.getTime() - from.getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

export function spanDays(dates: readonly Date[]): number {
  if (dates.length === 0) return 0;
  let from = dayKey(dates[0]!);
  let to = from;
  for (const date of dates) {
    const key = dayKey(date);
    if (key < from) from = key;
    if (key > to) to = key;
  }
  return rangeLengthDays({ from, to });
}

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

export function precedingRange(range: DateRange): DateRange {
  const length = rangeLengthDays(range);
  const to = shiftDays(range.from, -1);
  return { from: shiftDays(to, -(length - 1)), to };
}

export function inRange(key: string, range: DateRange): boolean {
  if (!parseDayKey(range.from) || !parseDayKey(range.to)) return false;
  return key >= range.from && key <= range.to;
}

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

export function normalizeRange(
  range: DateRange,
  today: Date = new Date(),
): DateRange {
  const from = parseDayKey(range.from);
  const to = parseDayKey(range.to);
  if (!from && !to) {
    const key = dayKey(today);
    return { from: key, to: key };
  }
  if (!from) return { from: range.to, to: range.to };
  if (!to) return { from: range.from, to: range.from };
  return range.from <= range.to ? range : { from: range.to, to: range.from };
}
