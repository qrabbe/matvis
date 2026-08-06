import type { CatalogRow } from '@matvis/shared';
import {
  CONSUMPTION_WINDOW_DAYS,
  addMacros,
  scaleMacros,
  ZERO_MACROS,
  type Macros,
} from './nutrition';
import type { PurchaseLine } from './purchases';

export interface PantryGroup {
  ean: string;
  name: string;
  product: CatalogRow;
  unitsBought: number;
  spend: number;
  lines: number;
  firstPurchase: Date;
  lastPurchase: Date;
  totalMacros: Macros | null;
  remainingMacros: Macros;
  remainingFraction: number;
}

export interface PantryStock {
  products: number;
  macros: Macros;
  proteinDays: number | null;
}

export const LOW_PROTEIN_DAYS = 3;

export function remainingFraction(
  purchasedAt: Date,
  now: Date,
  windowDays: number = CONSUMPTION_WINDOW_DAYS,
): number {
  const elapsedDays = (now.getTime() - purchasedAt.getTime()) / 86_400_000;
  if (elapsedDays <= 0) return 1;
  if (elapsedDays >= windowDays) return 0;
  return 1 - elapsedDays / windowDays;
}

export function groupPantry(
  lines: readonly PurchaseLine[],
  now: Date = new Date(),
  windowDays: number = CONSUMPTION_WINDOW_DAYS,
): PantryGroup[] {
  const groups = new Map<string, PantryGroup>();
  const remainingUnits = new Map<string, number>();

  for (const line of lines) {
    const product = line.product;
    if (!product) continue;
    const ean = product.ean;

    const existing = groups.get(ean);
    const units = line.item.quantity ?? 1;
    const fraction = remainingFraction(line.purchasedAt, now, windowDays);
    const remaining = line.macros
      ? scaleOrZero(line.macros, fraction)
      : ZERO_MACROS;
    remainingUnits.set(ean, (remainingUnits.get(ean) ?? 0) + units * fraction);

    if (!existing) {
      groups.set(ean, {
        ean,
        name: product.name,
        product,
        unitsBought: units,
        spend: line.item.price,
        lines: 1,
        firstPurchase: line.purchasedAt,
        lastPurchase: line.purchasedAt,
        totalMacros: line.macros,
        remainingMacros: remaining,
        remainingFraction: fraction,
      });
      continue;
    }

    existing.unitsBought += units;
    existing.spend += line.item.price;
    existing.lines += 1;
    if (line.purchasedAt < existing.firstPurchase) {
      existing.firstPurchase = line.purchasedAt;
    }
    if (line.purchasedAt > existing.lastPurchase) {
      existing.lastPurchase = line.purchasedAt;
    }
    if (line.macros) {
      existing.totalMacros = existing.totalMacros
        ? addMacros(existing.totalMacros, line.macros)
        : line.macros;
    }
    existing.remainingMacros = addMacros(existing.remainingMacros, remaining);
  }

  const out = [...groups.values()];
  for (const group of out) {
    const total = group.totalMacros?.kcal ?? 0;
    if (total > 0) {
      group.remainingFraction = group.remainingMacros.kcal / total;
      continue;
    }
    const units = remainingUnits.get(group.ean) ?? 0;
    group.remainingFraction =
      group.unitsBought > 0 ? units / group.unitsBought : 0;
  }
  return out.sort(
    (a, b) => (b.totalMacros?.kcal ?? 0) - (a.totalMacros?.kcal ?? 0),
  );
}

function scaleOrZero(macros: Macros, factor: number): Macros {
  if (factor <= 0) return ZERO_MACROS;
  return scaleMacros(macros, factor);
}

export function pantryStock(
  groups: readonly PantryGroup[],
  averageDailyProtein: number,
): PantryStock {
  let macros = ZERO_MACROS;
  let products = 0;
  for (const group of groups) {
    if (group.remainingFraction <= 0 && group.remainingMacros.kcal <= 0) {
      continue;
    }
    products += 1;
    macros = addMacros(macros, group.remainingMacros);
  }
  return {
    products,
    macros,
    proteinDays:
      averageDailyProtein > 0 ? macros.protein / averageDailyProtein : null,
  };
}
