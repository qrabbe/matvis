import { normalizeItemText } from '@matvis/shared';
import { MAX_MAP_ROWS_PER_STORE } from './validators';
import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';

/** A line's price counts as fitting a row's reference `price` when it's
 * within this many kronor of some small multiple of it — covers buying more
 * than one of the same line without needing `quantity` to be parsed right,
 * while staying far enough under a size step (Coop's own sizes are rarely
 * within a few öre of each other) to not blur two real products together. */
const PRICE_FIT_TOLERANCE = 0.05;
const MAX_QUANTITY_GUESS = 12;

function fitsPrice(linePrice: number, rowPrice: number): boolean {
  if (rowPrice <= 0) return false;
  for (let q = 1; q <= MAX_QUANTITY_GUESS; q++) {
    if (Math.abs(linePrice - q * rowPrice) <= PRICE_FIT_TOLERANCE) return true;
  }
  return false;
}

/** The same printed text can mean different real products at different
 * prices (Coop prints "HAVREGRYN" for a 750g bag and a 1500g bag alike), so
 * a text can have more than one `itemGtinMap` row. This picks the right one
 * for a specific line: a row whose `price` fits the line's price wins; with
 * no priced row fitting, the generic (price-less) row is the catch-all; with
 * neither, the first row is the pre-existing fallback for old text-only
 * data. Only when several priced rows exist and none fit does this leave
 * the line unmatched rather than guessing — that's the actual fix, priced
 * ambiguity is exactly the case a blind first-row pick got wrong. */
function pickMapRow(
  rows: Doc<'itemGtinMap'>[],
  linePrice: number,
): Doc<'itemGtinMap'> | null {
  if (rows.length === 0) return null;
  const priced = rows.filter((r) => r.price !== undefined);
  const fit = priced.find((r) => fitsPrice(linePrice, r.price!));
  if (fit) return fit;
  const generic = rows.find((r) => r.price === undefined);
  if (generic) return generic;
  if (priced.length > 0) return null; // ambiguous priced rows, none fit
  return rows[0];
}

export type GtinMap = Map<string, Doc<'itemGtinMap'>[]>;

/** Loads every `itemGtinMap` row for a store in one indexed scan, grouped by
 * text — so resolving a whole receipt's lines costs one query, not one per
 * line. Read live (not cached in `receiptItems`), so a row added long after
 * a receipt was synced still resolves on the very next read. */
export async function loadGtinMap(
  ctx: QueryCtx,
  store: Doc<'receipts'>['source'],
): Promise<GtinMap> {
  const rows = await ctx.db
    .query('itemGtinMap')
    .withIndex('by_store_text', (q) => q.eq('store', store))
    .take(MAX_MAP_ROWS_PER_STORE);
  const map: GtinMap = new Map();
  for (const row of rows) {
    const existing = map.get(row.normalizedText);
    if (existing) existing.push(row);
    else map.set(row.normalizedText, [row]);
  }
  return map;
}

export function resolveGtin(
  map: GtinMap,
  item: { text: string; price: number; isDiscount: boolean },
): string | undefined {
  if (item.isDiscount) return undefined;
  const normalizedText = normalizeItemText(item.text);
  if (normalizedText === '') return undefined;
  const rows = map.get(normalizedText) ?? [];
  return pickMapRow(rows, item.price)?.gtin;
}
