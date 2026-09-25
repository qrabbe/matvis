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

export interface ProteinSource {
  name: string;
  proteinG: number;
}

/** Which products a range's finished, marked protein actually came from —
 * biggest contributor first. Grouped by display name (the product's own
 * name when resolved, else the printed text), not by group key, since this
 * is for a person reading a list, not another join. */
export function proteinSources(
  marks: readonly MarkRow[],
  unitsByKey: ReadonlyMap<string, PantryUnit>,
  rangeFrom: string,
  rangeTo: string,
): ProteinSource[] {
  const byName = new Map<string, number>();

  for (const mark of marks) {
    if (mark.outcome !== 'finished') continue;
    if (mark.finishedAt < Date.parse(`${rangeFrom}T00:00:00`)) continue;
    if (mark.finishedAt > Date.parse(`${rangeTo}T23:59:59`)) continue;
    const unit = unitsByKey.get(unitKeyOf(mark));
    if (!unit) continue;
    const macros = unitMacros(unit);
    if (!macros || macros.protein <= 0) continue;

    const name = unit.line.product?.name ?? unit.line.item.text;
    byName.set(name, (byName.get(name) ?? 0) + macros.protein);
  }

  return [...byName.entries()]
    .map(([name, proteinG]) => ({ name, proteinG }))
    .sort((a, b) => b.proteinG - a.proteinG);
}

export interface WasteSummary {
  kr: number;
  items: string[];
}

/** Sum of purchase price for units marked thrown away in a range — net of
 * any discount already folded into the receipt line's own price. */
export function wasteSummary(
  marks: readonly MarkRow[],
  unitsByKey: ReadonlyMap<string, PantryUnit>,
  rangeFrom: string,
  rangeTo: string,
): WasteSummary {
  let kr = 0;
  const items: string[] = [];

  for (const mark of marks) {
    if (mark.outcome !== 'wasted') continue;
    if (mark.finishedAt < Date.parse(`${rangeFrom}T00:00:00`)) continue;
    if (mark.finishedAt > Date.parse(`${rangeTo}T23:59:59`)) continue;
    const unit = unitsByKey.get(unitKeyOf(mark));
    if (!unit) continue;
    kr += unit.line.item.price;
    items.push(unit.line.product?.name ?? unit.line.item.text);
  }

  return { kr, items };
}
