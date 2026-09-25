import {
  expandLinesToUnits,
  pantryGroupKey,
  type PantryUnit,
} from './pantryUnits';
import type { PurchaseLine } from './purchases';

const MS_PER_DAY = 86_400_000;

export interface DurationEstimate {
  daysToFinish: number;
  maxDaysFromPurchase?: number;
}

export interface BackfillMark {
  receiptId: string;
  lineNo: number;
  unitIndex: number;
  startedAt: number;
  finishedAt: number;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/** The gap between consecutive purchases, in days — evidence of how often
 * the account actually buys this, once there have been enough purchases to
 * call it a pace rather than a coincidence. */
function ownPaceDays(purchaseDatesMs: readonly number[]): number | null {
  if (purchaseDatesMs.length < 3) return null;
  const sorted = [...purchaseDatesMs].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i]! - sorted[i - 1]!) / MS_PER_DAY);
  }
  return median(gaps);
}

/** The one-time backfill's queueing rules — see `tickets/app-ux/
 * reference-ux-plan.html#backfill`. Own pace beats the estimate once there
 * are 3+ purchases (capped at twice the estimate, so a rarely-bought
 * perishable doesn't inherit a buying-cadence number that has nothing to do
 * with how long it lasts), and a unit waits in the queue at most one
 * duration — without that cap, an estimate longer than the real buying
 * cadence makes every later unit's start slip further behind its own
 * purchase date, and the backlog never resolves (this is the "36 milk
 * cartons at home" bug the plan describes finding and fixing). These rules
 * exist only for this one-time simulation; the live app never auto-finishes
 * anything. */
export function simulateGroupBackfill(
  units: readonly PantryUnit[],
  estimate: DurationEstimate,
  trackingStartMs: number,
): { toFinish: BackfillMark[]; stillInPantryKeys: string[] } {
  const sorted = [...units].sort(
    (a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime(),
  );

  const pace = ownPaceDays(sorted.map((u) => u.purchasedAt.getTime()));
  const cappedEstimateDays = Math.min(
    estimate.daysToFinish,
    estimate.maxDaysFromPurchase ?? Infinity,
  );
  const durationDays =
    pace !== null ? Math.min(pace, cappedEstimateDays * 2) : cappedEstimateDays;
  const durationMs = durationDays * MS_PER_DAY;

  const toFinish: BackfillMark[] = [];
  const stillInPantryKeys: string[] = [];
  let previousFinish = -Infinity;

  for (const unit of sorted) {
    const purchaseMs = unit.purchasedAt.getTime();
    const naturalStart = Math.max(purchaseMs, previousFinish);
    const start = Math.min(naturalStart, purchaseMs + durationMs);
    const finish = start + durationMs;
    previousFinish = finish;

    if (finish < trackingStartMs) {
      toFinish.push({
        receiptId: unit.receiptId,
        lineNo: unit.lineNo,
        unitIndex: unit.unitIndex,
        startedAt: start,
        finishedAt: finish,
      });
    } else {
      stillInPantryKeys.push(unit.key);
    }
  }

  return { toFinish, stillInPantryKeys };
}

/** Runs every group in one receipt history through {@link
 * simulateGroupBackfill}. `estimates` is keyed by `pantryGroupKey` — a
 * group with no estimate falls back to `defaultDurationDays` (the same
 * flat default `durations.ts` uses at the bottom of its own fallback
 * chain). */
export function simulateBackfill(
  lines: readonly PurchaseLine[],
  estimates: ReadonlyMap<string, DurationEstimate>,
  trackingStartMs: number,
  defaultDurationDays = 7,
): BackfillMark[] {
  const units = expandLinesToUnits(lines);
  const groups = new Map<string, PantryUnit[]>();
  for (const unit of units) {
    const key = pantryGroupKey(unit);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(unit);
    else groups.set(key, [unit]);
  }

  const marks: BackfillMark[] = [];
  for (const [groupKey, groupUnits] of groups) {
    const estimate = estimates.get(groupKey) ?? {
      daysToFinish: defaultDurationDays,
    };
    marks.push(
      ...simulateGroupBackfill(groupUnits, estimate, trackingStartMs).toFinish,
    );
  }
  return marks;
}
