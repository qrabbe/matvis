import { dayKey, parseDayKey } from './format';

/**
 * The calendar grid behind the spend heatmap: one column per week, seven rows
 * per column, Monday first. Pure and timezone-safe, so it can be tested without
 * rendering the component.
 */

/** One column of seven day keys. `null` pads the trailing partial week. */
export type HeatmapWeek = (string | null)[];

/** A month name pinned to the column its first day falls in. */
export interface HeatmapMonthLabel {
  column: number;
  label: string;
}

export interface HeatmapGrid {
  weeks: HeatmapWeek[];
  monthLabels: HeatmapMonthLabel[];
}

/** Weekday index with Monday as 0, from JS's Sunday-as-0. */
export function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/**
 * Build the grid for the `months` months ending at `today`. Month labels go
 * through `parseDayKey`, not `new Date(key)`: the latter reads a `YYYY-MM-DD`
 * string as UTC midnight, which west of Greenwich lands on the previous day and
 * labels every month boundary one column and one month early.
 */
export function buildHeatmapGrid(today: Date, months: number): HeatmapGrid {
  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setMonth(start.getMonth() - months);
  // Back up to the Monday on or before the start, so every column is a full
  // week and rows line up with the weekday labels.
  start.setDate(start.getDate() - mondayIndex(start));

  const weeks: HeatmapWeek[] = [];
  const monthLabels: HeatmapMonthLabel[] = [];
  const cursor = new Date(start);
  let lastMonth = -1;

  while (cursor <= end) {
    const column: HeatmapWeek = [];
    for (let row = 0; row < 7; row++) {
      if (cursor > end) {
        column.push(null);
      } else {
        column.push(dayKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    const first = column.find((day) => day !== null);
    const firstDate = first ? parseDayKey(first) : null;
    if (firstDate) {
      const month = firstDate.getMonth();
      if (month !== lastMonth) {
        lastMonth = month;
        monthLabels.push({
          column: weeks.length,
          label: firstDate.toLocaleDateString('sv-SE', { month: 'short' }),
        });
      }
    }
    weeks.push(column);
  }

  return { weeks, monthLabels };
}
