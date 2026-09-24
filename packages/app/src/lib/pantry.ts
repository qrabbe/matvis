import type { CatalogRow } from '@matvis/shared';
import type { LineAllocation } from './consumption';
import { addMacros, ZERO_MACROS, type Macros } from './nutrition';

export interface PantryGroup {
  ean: string;
  name: string;
  product: CatalogRow;
  outstandingQuantity: number;
  outstandingMacros: Macros;
  totalMacros: Macros | null;
  spend: number;
  lines: number;
  firstPurchase: Date;
  lastPurchase: Date;
}

export interface PantryStock {
  products: number;
  macros: Macros;
  proteinDays: number | null;
}

export const LOW_PROTEIN_DAYS = 3;

/** Groups every purchase line still holding outstanding (unconsumed)
 * quantity by product — what allocateConsumption's FIFO depletion left in
 * the pantry. A product fully depleted by logged events, or opted out via
 * `excludedEans`, does not appear here at all. */
export function groupPantry(
  allocations: readonly LineAllocation[],
  excludedEans: ReadonlySet<string> = new Set(),
): PantryGroup[] {
  const groups = new Map<string, PantryGroup>();

  for (const alloc of allocations) {
    const { line, outstandingQuantity, outstandingMacros } = alloc;
    const product = line.product;
    if (!product) continue;
    if (excludedEans.has(product.ean)) continue;
    if (outstandingQuantity <= 0) continue;

    const existing = groups.get(product.ean);
    if (!existing) {
      groups.set(product.ean, {
        ean: product.ean,
        name: product.name,
        product,
        outstandingQuantity,
        outstandingMacros,
        totalMacros: line.macros,
        spend: line.item.price,
        lines: 1,
        firstPurchase: line.purchasedAt,
        lastPurchase: line.purchasedAt,
      });
      continue;
    }

    existing.outstandingQuantity += outstandingQuantity;
    existing.outstandingMacros = addMacros(
      existing.outstandingMacros,
      outstandingMacros,
    );
    existing.totalMacros = line.macros
      ? addMacros(existing.totalMacros ?? ZERO_MACROS, line.macros)
      : existing.totalMacros;
    existing.spend += line.item.price;
    existing.lines += 1;
    if (line.purchasedAt < existing.firstPurchase) {
      existing.firstPurchase = line.purchasedAt;
    }
    if (line.purchasedAt > existing.lastPurchase) {
      existing.lastPurchase = line.purchasedAt;
    }
  }

  return [...groups.values()].sort(
    (a, b) => (b.totalMacros?.kcal ?? 0) - (a.totalMacros?.kcal ?? 0),
  );
}

export function pantryStock(
  groups: readonly PantryGroup[],
  averageDailyProtein: number,
): PantryStock {
  let macros = ZERO_MACROS;
  for (const group of groups)
    macros = addMacros(macros, group.outstandingMacros);
  return {
    products: groups.length,
    macros,
    proteinDays:
      averageDailyProtein > 0 ? macros.protein / averageDailyProtein : null,
  };
}
