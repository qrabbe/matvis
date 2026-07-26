import type { StoreSlug } from '@matvis/shared';
import type { CatalogRow } from './catalogApi';
import type { ReceiptHeader, ReceiptItemDoc } from './convexApi';
import { dayKey } from './format';
import { itemMacros, type Macros } from './nutrition';

/**
 * The join between a receipt line and the product it resolves to, and the
 * coverage numbers that come out of it. Pure: `hooks/usePurchaseData.ts` does
 * the fetching and caching, then calls in here for the derivation, so every tab
 * agrees on the numbers and the derivation is testable without a network.
 */

/** One non-discount receipt line, joined to its product where one exists. */
export interface PurchaseLine {
  item: ReceiptItemDoc;
  header: ReceiptHeader;
  /** Purchase date as a local `YYYY-MM-DD` key — the bucket key everything
   * per-day agrees on. */
  day: string;
  purchasedAt: Date;
  /** The catalog row for `item.gtin`, or `null` when the line is unmatched, the
   * EAN is not catalogued, or the catalog is unreachable. */
  product: CatalogRow | null;
  /** Macros for this line, or `null` when it cannot be scaled without guessing
   * (see lib/nutrition.ts). Never substitute a zero. */
  macros: Macros | null;
}

/**
 * How much of the account is actually resolvable, as a funnel. Every
 * product-dependent view shows the slice it depends on, as a first-class
 * element rather than an error state: today `matched` is near zero because
 * nothing fills `itemGtinMap` yet, and a view that hides that just looks broken.
 */
export interface Coverage {
  /** Non-discount lines across every receipt loaded. The denominator. */
  totalLines: number;
  /** Lines carrying a `gtin` — the connector matched the printed text. */
  matchedLines: number;
  /** Matched lines whose EAN resolves to a catalog row. */
  catalogedLines: number;
  /** Catalogued lines whose product carries no nutrition block at all. */
  noNutritionLines: number;
  /** Lines with nutrition that still could not be scaled — an unresolvable unit
   * or a dimension mismatch. Counted rather than guessed at. */
  notScalableLines: number;
  /** Lines that produced real macros. The number Nutrition and Pantry rest on. */
  nutritionLines: number;
}

export const EMPTY_COVERAGE: Coverage = {
  totalLines: 0,
  matchedLines: 0,
  catalogedLines: 0,
  noNutritionLines: 0,
  notScalableLines: 0,
  nutritionLines: 0,
};

/**
 * The purchase timestamp of a receipt, most trustworthy source first: the
 * printed `purchasedAt`, then the connector's parsed `purchasedAtMs`, then the
 * row's creation time. The last is a sync artefact rather than a purchase date,
 * but it keeps a receipt on the timeline instead of dropping it.
 */
export function receiptDate(header: ReceiptHeader): Date {
  if (header.purchasedAt) {
    const parsed = new Date(header.purchasedAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (header.purchasedAtMs != null) return new Date(header.purchasedAtMs);
  return new Date(header._creationTime);
}

/**
 * Pick which store's row to use for an EAN. The catalog is keyed by
 * (store, EAN), so a shared product has one row per chain that stocks it.
 * Prefer the chain the receipt came from — its package size and name are the
 * ones actually on the shelf — and fall back to any row, since a product
 * description is close enough across chains to beat showing nothing.
 */
export function pickProduct(
  rows: readonly CatalogRow[] | undefined,
  source: StoreSlug,
): CatalogRow | null {
  if (!rows || rows.length === 0) return null;
  return rows.find((row) => row.store === source) ?? rows[0] ?? null;
}

/**
 * Build the joined line list. Discount lines are dropped here rather than in
 * each consumer: they are a rebate against another line, not a purchase of
 * anything, so counting them would inflate every denominator. The Stats tab
 * reads discounts off the receipt header instead.
 */
export function buildLines(
  headers: readonly ReceiptHeader[],
  itemsByReceipt: ReadonlyMap<string, ReceiptItemDoc[]>,
  productsByEan: ReadonlyMap<string, CatalogRow[]>,
): PurchaseLine[] {
  const lines: PurchaseLine[] = [];
  for (const header of headers) {
    const items = itemsByReceipt.get(header._id);
    if (!items) continue;
    const purchasedAt = receiptDate(header);
    const day = dayKey(purchasedAt);
    for (const item of items) {
      if (item.isDiscount) continue;
      const product = item.gtin
        ? pickProduct(productsByEan.get(item.gtin), header.source)
        : null;
      lines.push({
        item,
        header,
        day,
        purchasedAt,
        product,
        macros: product ? itemMacros(item, product) : null,
      });
    }
  }
  return lines;
}

/** Walk the funnel once. Every tab reads the slice it cares about from the
 * result rather than recomputing its own denominator. */
export function computeCoverage(lines: readonly PurchaseLine[]): Coverage {
  const coverage: Coverage = { ...EMPTY_COVERAGE, totalLines: lines.length };
  for (const line of lines) {
    if (!line.item.gtin) continue;
    coverage.matchedLines++;
    if (!line.product) continue;
    coverage.catalogedLines++;
    if (!line.product.food?.nutrition) {
      coverage.noNutritionLines++;
      continue;
    }
    if (line.macros) coverage.nutritionLines++;
    else coverage.notScalableLines++;
  }
  return coverage;
}

/** The distinct EANs a set of items needs looked up, in first-seen order so a
 * chunked fetch resolves the earliest receipts first. */
export function distinctGtins(
  itemsByReceipt: ReadonlyMap<string, ReceiptItemDoc[]>,
): string[] {
  const seen = new Set<string>();
  for (const items of itemsByReceipt.values()) {
    for (const item of items) {
      if (item.gtin && !item.isDiscount) seen.add(item.gtin);
    }
  }
  return [...seen];
}

/** Split a list into fixed-size chunks — `getManyByEan` is capped server side. */
export function chunk<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}
