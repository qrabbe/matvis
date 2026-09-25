import { dayKey } from './format';
import { eachDay } from './dateRange';
import { addMacros, scaleMacros, ZERO_MACROS, type Macros } from './nutrition';
import { unitMacros, type PantryUnit } from './pantryUnits';
import type { MarkRow } from './appBackendApi';

export interface DayMacros {
  day: string;
  macros: Macros;
}

function unitKeyOf(
  m: Pick<MarkRow, 'receiptId' | 'lineNo' | 'unitIndex'>,
): string {
  return `${m.receiptId}:${m.lineNo}:${m.unitIndex}`;
}

/** Real intake, marked-only: a finished unit's macros spread evenly across
 * every calendar day from its Started to its Finished date, inclusive — a
 * bag of rice eaten two weeks after purchase spreads over two weeks, a
 * same-day snack spreads over one day. A wasted unit contributes nothing
 * (it was never eaten). A unit with no usable macros contributes nothing
 * rather than a confident zero, and never throws for a mark whose unit
 * isn't in `unitsByKey` (stale data, not yet loaded). */
export function markedIntakeByDay(
  marks: readonly MarkRow[],
  unitsByKey: ReadonlyMap<string, PantryUnit>,
): DayMacros[] {
  const byDay = new Map<string, Macros>();

  for (const mark of marks) {
    if (mark.outcome !== 'finished') continue;
    const unit = unitsByKey.get(unitKeyOf(mark));
    if (!unit) continue;
    const macros = unitMacros(unit);
    if (!macros) continue;

    const startedAt = mark.startedAt ?? unit.purchasedAt.getTime();
    const days = eachDay({
      from: dayKey(new Date(startedAt)),
      to: dayKey(new Date(mark.finishedAt)),
    });
    if (days.length === 0) continue;

    const share = scaleMacros(macros, 1 / days.length);
    for (const day of days) {
      byDay.set(day, addMacros(byDay.get(day) ?? ZERO_MACROS, share));
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, macros]) => ({ day, macros }));
}

export function sumMacros(days: readonly DayMacros[]): Macros {
  let total = ZERO_MACROS;
  for (const d of days) total = addMacros(total, d.macros);
  return total;
}

/** The forecast: every unit still in the pantry has an expected finish
 * date from its typical duration, and its *remaining* macros (it hasn't
 * been eaten yet, so all of it is remaining) spread from today to that
 * date. Only ever drawn to the right of today — a caller filtering the
 * chart to future days gets that for free, since nothing here dates
 * earlier than `today`. */
export function forecastByDay(
  outstandingUnits: readonly PantryUnit[],
  typicalDurationDaysOf: (unit: PantryUnit) => number,
  today: Date,
): DayMacros[] {
  const byDay = new Map<string, Macros>();
  const todayKey = dayKey(today);

  for (const unit of outstandingUnits) {
    const macros = unitMacros(unit);
    if (!macros) continue;
    const durationDays = typicalDurationDaysOf(unit);
    if (!Number.isFinite(durationDays) || durationDays <= 0) continue;

    const expectedFinish = new Date(today);
    expectedFinish.setDate(expectedFinish.getDate() + Math.round(durationDays));
    const days = eachDay({ from: todayKey, to: dayKey(expectedFinish) });
    if (days.length === 0) continue;

    const share = scaleMacros(macros, 1 / days.length);
    for (const day of days) {
      byDay.set(day, addMacros(byDay.get(day) ?? ZERO_MACROS, share));
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, macros]) => ({ day, macros }));
}
