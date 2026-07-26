import type { CatalogRow } from './catalogApi';
import {
  CONSUMPTION_WINDOW_DAYS,
  addMacros,
  ZERO_MACROS,
  type Macros,
} from './nutrition';
import type { PurchaseLine } from './purchases';

/**
 * Pantry grouping: what was bought and, under the spreading model, has not yet
 * been notionally consumed. Pure.
 *
 * "Notionally" is doing real work in that sentence. Nothing here knows what was
 * eaten — the app has no write access, so there is no way to record it (see
 * lib/nutrition.ts and ticket 17). A purchase is treated as consumed evenly over
 * {@link CONSUMPTION_WINDOW_DAYS} days, so "in the pantry" means "bought inside
 * the window, prorated by how much of the window is left". Every surface that
 * shows these numbers has to say so.
 */

/** One product, aggregated across every line that bought it. */
export interface PantryGroup {
  /** The EAN — the group key. */
  ean: string;
  /** Display name, from the catalog row. */
  name: string;
  product: CatalogRow;
  /** How many units were bought across the whole history. */
  unitsBought: number;
  /** Total spend on this product. */
  spend: number;
  /** Number of receipt lines that bought it. */
  lines: number;
  firstPurchase: Date;
  lastPurchase: Date;
  /** Macros of everything ever bought. `null` for none of it being scalable. */
  totalMacros: Macros | null;
  /** The share of {@link totalMacros} still inside the consumption window. */
  remainingMacros: Macros;
  /** Fraction of the purchased amount still notionally unconsumed, 0..1. */
  remainingFraction: number;
}

/** The strip above the pantry list: what is notionally still on the shelf. */
export interface PantryStock {
  /** Distinct products with anything remaining. */
  products: number;
  macros: Macros;
  /**
   * How many days the remaining protein covers at the account's own average
   * daily intake, or `null` when there is no average to divide by. The one
   * number in the old app that answered a real question.
   */
  proteinDays: number | null;
}

/** Below this many protein days the strip warns. Three days is roughly "top up
 * on the next normal shop" rather than "you are out". */
export const LOW_PROTEIN_DAYS = 3;

/**
 * How much of a purchase is still notionally unconsumed at `now`, as a fraction
 * of the whole. 1 on the day of purchase, linearly down to 0 at the end of the
 * window, clamped at both ends so a future-dated receipt cannot exceed 1.
 */
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

/**
 * Group matched lines by product. Only lines that resolved to a catalog row can
 * appear — an unmatched line has no product to group under, which is exactly
 * what the Unmapped tab is for, and why the empty state here points there.
 *
 * Sorted by total energy, so the products that dominate the account's calories
 * sort to the top. Products with no scalable nutrition fall to the bottom rather
 * than being dropped: they were still bought.
 */
export function groupPantry(
  lines: readonly PurchaseLine[],
  now: Date = new Date(),
  windowDays: number = CONSUMPTION_WINDOW_DAYS,
): PantryGroup[] {
  const groups = new Map<string, PantryGroup>();

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
        // Provisional: recomputed below once every line is in, so it is the
        // energy-weighted share rather than the last line's.
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
    group.remainingFraction =
      total > 0 ? group.remainingMacros.kcal / total : group.remainingFraction;
  }
  return out.sort(
    (a, b) => (b.totalMacros?.kcal ?? 0) - (a.totalMacros?.kcal ?? 0),
  );
}

/** `scaleMacros` with a guard, so a zero fraction yields real zeroes rather
 * than `-0`s that print as "-0 g". */
function scaleOrZero(macros: Macros, factor: number): Macros {
  if (factor <= 0) return ZERO_MACROS;
  return {
    kcal: macros.kcal * factor,
    protein: macros.protein * factor,
    fat: macros.fat * factor,
    saturatedFat: macros.saturatedFat * factor,
    carbs: macros.carbs * factor,
    sugars: macros.sugars * factor,
    fiber: macros.fiber * factor,
    salt: macros.salt * factor,
  };
}

/**
 * The stock strip. `averageDailyProtein` comes from the Nutrition derivation
 * (the account's own spread-out average), not from a recommendation — so
 * "protein days" answers "how long does this last at the rate I actually buy",
 * which is a question the data can answer, rather than "how long should it
 * last", which it cannot.
 */
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
