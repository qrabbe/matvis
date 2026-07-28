import { eachDay, type DateRange } from './dateRange';
import { formatDayShort } from './format';

/**
 * The per-day chart series and the drill-down lookup that goes with it. Pure, so
 * the click-to-day resolution can be tested without rendering a chart.
 */

/** One bar: the day key it belongs to, its axis label and its value. */
export interface DayPoint {
  /** `YYYY-MM-DD`. The identity. */
  day: string;
  /** Display only. Omits the year, so it is not unique over a long range. */
  label: string;
  value: number;
}

/** Every day in the range, empty ones included — a chart drawn only over days
 * with data silently rescales its axis and turns a gap into a dense week. */
export function daySeries(
  range: DateRange,
  valueForDay: (day: string) => number,
): DayPoint[] {
  return eachDay(range).map((day) => ({
    day,
    label: formatDayShort(day),
    value: valueForDay(day),
  }));
}

/**
 * The day key behind a clicked bar, resolved by index. Matching the axis label
 * instead would break over any range spanning two years: `2025-03-14` and
 * `2026-03-14` both render as "14 mars" and the first one always wins.
 */
export function dayAtIndex(
  series: readonly DayPoint[],
  activeIndex: unknown,
): string | null {
  // `Number(null)` and `Number('')` are both 0, which would silently open the
  // first bar for a click that hit no bar at all.
  if (activeIndex == null || activeIndex === '') return null;
  const index = Number(activeIndex);
  if (!Number.isInteger(index)) return null;
  return series[index]?.day ?? null;
}
