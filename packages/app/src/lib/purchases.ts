import type {
  CatalogRow,
  ReceiptHeader,
  ReceiptItemDoc,
  StoreSlug,
} from '@matvis/shared';
import { dayKey } from './format';
import { itemMacros, type Macros } from './nutrition';

export interface PurchaseLine {
  item: ReceiptItemDoc;
  header: ReceiptHeader;
  day: string;
  purchasedAt: Date;
  product: CatalogRow | null;
  macros: Macros | null;
}

export interface Coverage {
  totalLines: number;
  matchedLines: number;
  catalogedLines: number;
  noNutritionLines: number;
  notScalableLines: number;
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

export function receiptDate(header: ReceiptHeader): Date {
  if (header.purchasedAt) {
    const parsed = new Date(header.purchasedAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (header.purchasedAtMs != null) return new Date(header.purchasedAtMs);
  return new Date(header._creationTime);
}

export function pickProduct(
  rows: readonly CatalogRow[] | undefined,
  source: StoreSlug,
): CatalogRow | null {
  if (!rows || rows.length === 0) return null;
  return rows.find((row) => row.store === source) ?? rows[0] ?? null;
}

export interface BuiltLines {
  lines: PurchaseLine[];
  linesByReceipt: Map<string, PurchaseLine[]>;
}

export function buildLines(
  headers: readonly ReceiptHeader[],
  itemsByReceipt: ReadonlyMap<string, ReceiptItemDoc[]>,
  productsByEan: ReadonlyMap<string, CatalogRow[]>,
): BuiltLines {
  const lines: PurchaseLine[] = [];
  const linesByReceipt = new Map<string, PurchaseLine[]>();
  for (const header of headers) {
    const items = itemsByReceipt.get(header._id);
    if (!items) continue;
    const purchasedAt = receiptDate(header);
    const day = dayKey(purchasedAt);
    const forReceipt: PurchaseLine[] = [];
    for (const item of items) {
      if (item.isDiscount) continue;
      const product = item.gtin
        ? pickProduct(productsByEan.get(item.gtin), header.source)
        : null;
      const line: PurchaseLine = {
        item,
        header,
        day,
        purchasedAt,
        product,
        macros: product ? itemMacros(item, product) : null,
      };
      lines.push(line);
      forReceipt.push(line);
    }
    linesByReceipt.set(header._id, forReceipt);
  }
  return { lines, linesByReceipt };
}

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
