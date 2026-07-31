import type { CatalogRow, ReceiptItemDoc } from '@matvis/shared';
import { dayKey } from './format';
import { parseUnit, toBaseUnits } from './units';

/**
 * Per-item macros and the per-day spread. Pure — everything here is a function
 * of one receipt line plus one catalog row, with no clock and no I/O, which is
 * what makes it testable and what keeps every tab agreeing on the numbers.
 */

/**
 * How many days a purchase's macros are spread across, starting on the purchase
 * date. A shop on the 1st contributes a tenth of its macros to each of the
 * 1st-10th.
 *
 * This is an ASSUMPTION, not a measurement, and it exists because the honest
 * alternative — per-item consumption dates — is a write, and the app has no
 * write access by construction. It keeps the one real insight of the old repo's
 * model (a bag of rice is not eaten in one day) without pretending to know when
 * anything was actually eaten.
 *
 * Ticket 17 (consumption tracking) replaces it with something real. This
 * constant is the single place that changes, and every surface that uses it must
 * say so in the UI — users must not read "what I ate" into "what I bought,
 * smoothed".
 */
export const CONSUMPTION_WINDOW_DAYS = 10;

/** The macro slots the app derives, in the fixed order the UI presents them. */
export interface Macros {
  kcal: number;
  protein: number;
  fat: number;
  saturatedFat: number;
  carbs: number;
  sugars: number;
  fiber: number;
  salt: number;
}

/** The macros a user can chart or rank by. A subset of {@link Macros}: the rest
 * are shown as detail, never as the primary series. */
export type MacroKey = 'kcal' | 'protein' | 'fat' | 'carbs' | 'sugars';

export const MACRO_LABELS: Record<MacroKey, string> = {
  kcal: 'Energy',
  protein: 'Protein',
  fat: 'Fat',
  carbs: 'Carbohydrate',
  sugars: 'Sugars',
};

/** The unit each chartable macro is measured in, for axes and tooltips. */
export const MACRO_UNITS: Record<MacroKey, string> = {
  kcal: 'kcal',
  protein: 'g',
  fat: 'g',
  carbs: 'g',
  sugars: 'g',
};

export const ZERO_MACROS: Macros = {
  kcal: 0,
  protein: 0,
  fat: 0,
  saturatedFat: 0,
  carbs: 0,
  sugars: 0,
  fiber: 0,
  salt: 0,
};

/** Sum macros in place-free fashion, so callers can `reduce` over lines. */
export function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    fat: a.fat + b.fat,
    saturatedFat: a.saturatedFat + b.saturatedFat,
    carbs: a.carbs + b.carbs,
    sugars: a.sugars + b.sugars,
    fiber: a.fiber + b.fiber,
    salt: a.salt + b.salt,
  };
}

/** Scale every slot by a factor, e.g. to spread a purchase across days. */
export function scaleMacros(m: Macros, factor: number): Macros {
  return {
    kcal: m.kcal * factor,
    protein: m.protein * factor,
    fat: m.fat * factor,
    saturatedFat: m.saturatedFat * factor,
    carbs: m.carbs * factor,
    sugars: m.sugars * factor,
    fiber: m.fiber * factor,
    salt: m.salt * factor,
  };
}

/**
 * How much of the product this line bought, expressed in the nutrition basis's
 * own base unit (g / ml / st), or `null` when that cannot be established
 * without guessing.
 *
 * Two cases, decided by the receipt line's own unit:
 *
 * - **Sold by weight or volume** (`unit` is a mass or volume unit): the printed
 *   quantity IS the purchased amount. `packageSize` is irrelevant and must not
 *   be multiplied in — that is how "0.652 KG loose bananas" would otherwise
 *   become 0.652 × a package.
 * - **Sold by count** (`unit` is `ST`, or absent, in which case the line is one
 *   package): purchased amount = quantity × the package's net content.
 *
 * Every path that cannot resolve a unit into the basis's dimension returns
 * `null` rather than a number. See lib/units.ts for why that matters.
 */
export function purchasedAmount(
  line: Pick<ReceiptItemDoc, 'quantity' | 'unit'>,
  product: Pick<CatalogRow, 'packageSize' | 'packageSizeUnit'>,
  basisUnit: string,
): number | null {
  const basis = parseUnit(basisUnit);
  if (!basis) return null;

  const quantity = line.quantity ?? 1;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const lineUnit = parseUnit(line.unit);

  // Sold by weight/volume: the quantity is the amount, and it has to be in the
  // basis's dimension for the two to be comparable at all.
  if (lineUnit && lineUnit.dimension !== 'count') {
    if (lineUnit.dimension !== basis.dimension) return null;
    return quantity * lineUnit.toBase;
  }

  // Sold by count. Nutrition stated per piece needs no package size.
  if (basis.dimension === 'count') return quantity;

  // Otherwise the package's net content is the bridge, and it must land in the
  // basis's dimension. This is the check the old repo did not have.
  if (product.packageSize == null || !Number.isFinite(product.packageSize)) {
    return null;
  }
  const pack = toBaseUnits(product.packageSize, product.packageSizeUnit);
  if (!pack || pack.dimension !== basis.dimension) return null;
  return quantity * pack.amount;
}

/**
 * The macros one receipt line contributed, or `null` when the line cannot be
 * scaled — no nutrition on the product, or a unit that will not resolve into the
 * basis's dimension. A `null` here is counted into the coverage meter as "not
 * scalable", never rendered as a zero: a zero would quietly drag every average
 * down.
 */
export function itemMacros(
  line: Pick<ReceiptItemDoc, 'quantity' | 'unit'>,
  product: CatalogRow,
): Macros | null {
  const nutrition = product.food?.nutrition;
  if (!nutrition) return null;
  if (
    !Number.isFinite(nutrition.basisQuantity) ||
    nutrition.basisQuantity <= 0
  ) {
    return null;
  }

  const basis = parseUnit(nutrition.basisUnit);
  if (!basis) return null;

  const amount = purchasedAmount(line, product, nutrition.basisUnit);
  if (amount === null) return null;

  // Both sides in the dimension's base unit, so the ratio is dimensionless.
  const scale = amount / (nutrition.basisQuantity * basis.toBase);
  if (!Number.isFinite(scale) || scale <= 0) return null;

  return {
    kcal: (nutrition.energyKcal ?? 0) * scale,
    protein: (nutrition.proteinG ?? 0) * scale,
    fat: (nutrition.fatG ?? 0) * scale,
    saturatedFat: (nutrition.saturatedFatG ?? 0) * scale,
    carbs: (nutrition.carbohydrateG ?? 0) * scale,
    sugars: (nutrition.sugarsG ?? 0) * scale,
    fiber: (nutrition.fiberG ?? 0) * scale,
    salt: (nutrition.saltG ?? 0) * scale,
  };
}

/** One day's share of a purchase, under the spreading model. */
export interface DailyShare {
  /** `YYYY-MM-DD`, local time. */
  day: string;
  macros: Macros;
}

/**
 * Spread a purchase's macros evenly over {@link CONSUMPTION_WINDOW_DAYS} days
 * starting on the purchase date. Returns one entry per day in the window, so a
 * caller can bucket without knowing the window length.
 */
export function spreadOverWindow(
  purchasedAt: Date,
  macros: Macros,
  windowDays: number = CONSUMPTION_WINDOW_DAYS,
): DailyShare[] {
  const days = Math.max(1, Math.floor(windowDays));
  const share = scaleMacros(macros, 1 / days);
  const out: DailyShare[] = [];
  const cursor = new Date(purchasedAt);
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    out.push({ day: dayKey(cursor), macros: share });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/**
 * Share of energy from each macronutrient, using the standard Atwater factors
 * (protein 4, carbohydrate 4, fat 9 kcal/g). Computed from the macros
 * themselves rather than from the stated kcal, so the three always sum to 1 and
 * the bar cannot render a gap when a product's stated energy disagrees with its
 * own macro breakdown.
 *
 * Returns `null` when there is no energy to split, which is a fresh account
 * rather than an error.
 */
export function energySplit(
  m: Macros,
): { protein: number; fat: number; carbs: number } | null {
  const protein = m.protein * 4;
  const fat = m.fat * 9;
  const carbs = m.carbs * 4;
  const total = protein + fat + carbs;
  if (total <= 0) return null;
  return { protein: protein / total, fat: fat / total, carbs: carbs / total };
}

/**
 * A daily protein target. A PLACEHOLDER, presented as "goal" and never as
 * advice: the app knows nothing about the user's weight, activity or health, so
 * it is in no position to recommend a number. Wired to the Preferences tab once
 * that stops being a placeholder itself.
 */
export const PROTEIN_GOAL_G = 150;
