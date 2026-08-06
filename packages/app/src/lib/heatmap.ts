import { dayKey, parseDayKey } from './format';

export type HeatmapWeek = (string | null)[];

export interface HeatmapMonthLabel {
  column: number;
  label: string;
}

export interface HeatmapGrid {
  weeks: HeatmapWeek[];
  monthLabels: HeatmapMonthLabel[];
}

export function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** The month ruler goes through `parseDayKey` for the same UTC reason, or every
 * month boundary lands one column early. */
export function buildHeatmapGrid(today: Date, months: number): HeatmapGrid {
  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setMonth(start.getMonth() - months);
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
