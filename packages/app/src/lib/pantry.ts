import type { CatalogRow, ItemMappingKind } from '@matvis/shared';
import type { MarkRow } from './appBackendApi';
import {
  expandLinesToUnits,
  pantryGroupKey,
  type PantryUnit,
} from './pantryUnits';
import type { PurchaseLine } from './purchases';
import {
  finishedSpans,
  resolveTypicalDuration,
  type FinishedSpan,
} from './durations';

const MS_PER_DAY = 86_400_000;

/** Anything that typically takes longer than this to run out folds into
 * "Cupboard staples" instead of crowding the top of a due-first grid. */
export const STAPLE_THRESHOLD_DAYS = 30;

export interface PantryTile {
  groupKey: string;
  kind: Extract<ItemMappingKind, 'product' | 'produce'>;
  gtin?: string;
  name: string;
  product: CatalogRow | null;
  /** Still in the pantry, oldest first — index 0 is the unit a tap finishes. */
  outstandingUnits: PantryUnit[];
  firstPurchase: Date;
  lastPurchase: Date;
  typicalDurationDays: number;
  /** Days until the oldest outstanding unit is expected to run out, from
   * its typical duration. Negative means it's already past that. Null when
   * every unit in the group is already finished (grouping never returns
   * these — kept only as the type callers narrow from). */
  dueInDays: number;
  isStaple: boolean;
}

function displayName(units: readonly PantryUnit[]): string {
  const withProduct = units.find((u) => u.line.product);
  if (withProduct?.line.product) return withProduct.line.product.name;
  return units[0]?.line.item.text ?? '';
}

/** Every outstanding unit, grouped into one tile per product (or per loose
 * produce text), due first. `today` is injected for deterministic tests;
 * callers pass `new Date()`. */
export function groupPantryTiles(
  lines: readonly PurchaseLine[],
  marks: readonly MarkRow[],
  today: Date,
  resolveEstimateDays: (groupKey: string) => number | null | undefined = () =>
    undefined,
  resolveCategoryMedianDays: (
    groupKey: string,
  ) => number | null | undefined = () => undefined,
): PantryTile[] {
  const units = expandLinesToUnits(lines);
  const unitsByKey = new Map(units.map((u) => [u.key, u]));
  const markedKeys = new Set(
    marks
      .map((m) => `${m.receiptId}:${m.lineNo}:${m.unitIndex}`)
      .filter((key) => unitsByKey.has(key)),
  );
  const spans = finishedSpans(marks, unitsByKey, pantryGroupKey);

  const groups = new Map<string, PantryUnit[]>();
  for (const unit of units) {
    if (markedKeys.has(unit.key)) continue; // already finished or wasted
    const key = pantryGroupKey(unit);
    if (!key) continue; // notFood, notInCatalog, or still unidentified
    const group = groups.get(key);
    if (group) group.push(unit);
    else groups.set(key, [unit]);
  }

  const tiles: PantryTile[] = [];
  for (const [groupKey, groupUnits] of groups) {
    const outstandingUnits = [...groupUnits].sort(
      (a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime(),
    );
    const oldest = outstandingUnits[0]!;
    const kind = oldest.line.item.kind as 'product' | 'produce';

    const typicalDurationDays = resolveTypicalDuration(
      spans,
      groupKey,
      resolveEstimateDays(groupKey),
      resolveCategoryMedianDays(groupKey),
    );
    const ageInDays =
      (today.getTime() - oldest.purchasedAt.getTime()) / MS_PER_DAY;

    let firstPurchase = outstandingUnits[0]!.purchasedAt;
    let lastPurchase = firstPurchase;
    for (const unit of outstandingUnits) {
      if (unit.purchasedAt < firstPurchase) firstPurchase = unit.purchasedAt;
      if (unit.purchasedAt > lastPurchase) lastPurchase = unit.purchasedAt;
    }

    tiles.push({
      groupKey,
      kind,
      gtin: oldest.line.item.gtin,
      name: displayName(outstandingUnits),
      product: oldest.line.product,
      outstandingUnits,
      firstPurchase,
      lastPurchase,
      typicalDurationDays,
      dueInDays: typicalDurationDays - ageInDays,
      isStaple: typicalDurationDays > STAPLE_THRESHOLD_DAYS,
    });
  }

  return tiles;
}

/** Due first: most overdue tiles on top, then soonest to run out — both are
 * just ascending `dueInDays`, since overdue is a negative number. */
export function sortDueFirst(tiles: readonly PantryTile[]): PantryTile[] {
  return [...tiles].sort((a, b) => a.dueInDays - b.dueInDays);
}

export function sortOldestFirst(tiles: readonly PantryTile[]): PantryTile[] {
  return [...tiles].sort(
    (a, b) => a.firstPurchase.getTime() - b.firstPurchase.getTime(),
  );
}

export function sortNewestFirst(tiles: readonly PantryTile[]): PantryTile[] {
  return [...tiles].sort(
    (a, b) => b.lastPurchase.getTime() - a.lastPurchase.getTime(),
  );
}

export function splitStaples(tiles: readonly PantryTile[]): {
  regular: PantryTile[];
  staples: PantryTile[];
} {
  const regular: PantryTile[] = [];
  const staples: PantryTile[] = [];
  for (const tile of tiles) (tile.isStaple ? staples : regular).push(tile);
  return { regular, staples };
}

export type { FinishedSpan };
