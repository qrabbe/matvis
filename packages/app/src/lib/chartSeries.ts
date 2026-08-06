import { eachDay, type DateRange } from './dateRange';
import { formatDayShort } from './format';

export interface DayPoint {
  day: string;
  label: string;
  value: number;
}

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

export function dayAtIndex(
  series: readonly DayPoint[],
  activeIndex: unknown,
): string | null {
  if (activeIndex == null || activeIndex === '') return null;
  const index = Number(activeIndex);
  if (!Number.isInteger(index)) return null;
  return series[index]?.day ?? null;
}
