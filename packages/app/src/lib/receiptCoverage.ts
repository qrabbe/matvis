import type { PurchaseLine } from './purchases';

export interface KrCoverage {
  identifiedKr: number;
  foodKr: number;
}

/** Coverage in kronor, not line counts — "88% of food spend identified"
 * reads the same whether the unidentified line is a free bag or a kilo of
 * cheese, which a line-count meter doesn't. A line counts as food the
 * moment it has *any* resolved kind other than `notFood` — produce and
 * "not in catalog" both count as food spend, just not yet identified
 * spend. Discount lines and `notFood` lines are excluded entirely, on
 * both sides of the fraction. */
export function krCoverage(lines: readonly PurchaseLine[]): KrCoverage {
  let identifiedKr = 0;
  let foodKr = 0;
  for (const line of lines) {
    if (line.item.isDiscount) continue;
    if (line.item.kind === 'notFood') continue;
    foodKr += line.item.price;
    if (line.item.kind === 'product') identifiedKr += line.item.price;
  }
  return { identifiedKr, foodKr };
}

export function krCoveragePercent(coverage: KrCoverage): number | null {
  if (coverage.foodKr <= 0) return null;
  return coverage.identifiedKr / coverage.foodKr;
}
