import type { CatalogRow, CatalogUnit, ReceiptItemDoc } from '@matvis/shared';
import { dayKey } from './format';
import { parseUnit } from './units';

export const CONSUMPTION_WINDOW_DAYS = 10;

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

export type MacroKey = 'kcal' | 'protein' | 'fat' | 'carbs' | 'sugars';

export const MACRO_LABELS: Record<MacroKey, string> = {
  kcal: 'Energy',
  protein: 'Protein',
  fat: 'Fat',
  carbs: 'Carbohydrate',
  sugars: 'Sugars',
};

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

/** A line sold by weight or volume must not have the package size multiplied
 * in, or "0.652 KG loose bananas" becomes 0.652 of a package.
 *
 * The receipt's own unit is still free prose and goes through `parseUnit`. The
 * catalog's side does not: `netContent` and `basisUnit` are both canonical, so
 * matching them is `===` rather than a dimension lookup and a conversion. */
export function purchasedAmount(
  line: Pick<ReceiptItemDoc, 'quantity' | 'unit'>,
  product: Pick<CatalogRow, 'netContent'>,
  basisUnit: CatalogUnit,
): number | null {
  const basis = parseUnit(basisUnit);
  if (!basis) return null;

  const quantity = line.quantity ?? 1;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const lineUnit = parseUnit(line.unit);

  if (lineUnit && lineUnit.dimension !== 'count') {
    if (lineUnit.dimension !== basis.dimension) return null;
    return quantity * lineUnit.toBase;
  }

  if (basis.dimension === 'count') return quantity;

  const pack = product.netContent;
  // A mismatch here is a product that genuinely cannot be scaled, e.g. a
  // millilitre package against a per-gram basis. Reported as unscalable rather
  // than approximated, which would need a density nobody has.
  if (!pack || pack.unit !== basisUnit) return null;
  if (!Number.isFinite(pack.value)) return null;
  return quantity * pack.value;
}

/** Returns `null` and never `0` for a line that cannot be scaled. A zero would
 * quietly drag every average down. */
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

export interface DailyShare {
  day: string;
  macros: Macros;
}

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

export const PROTEIN_GOAL_G = 150;
