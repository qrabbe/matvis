import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { normalizeItemText } from '@matvis/shared';
import { MAX_MAP_ROWS_PER_TEXT, MAX_RECEIPT_ITEMS } from './validators';
import type { Doc } from './_generated/dataModel';

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

export const matchReceipt = internalMutation({
  args: { receiptId: v.id('receipts') },
  returns: v.number(),
  handler: async (ctx, { receiptId }) => {
    const receipt = await ctx.db.get(receiptId);
    if (!receipt) return 0;

    const items = await ctx.db
      .query('receiptItems')
      .withIndex('by_receipt', (q) => q.eq('receiptId', receiptId))
      .take(MAX_RECEIPT_ITEMS);

    let matched = 0;
    for (const item of items) {
      if (item.gtin !== undefined || item.isDiscount) continue;
      const normalizedText = normalizeItemText(item.text);
      if (normalizedText === '') continue;
      const rows = await ctx.db
        .query('itemGtinMap')
        .withIndex('by_store_text', (q) =>
          q.eq('store', receipt.source).eq('normalizedText', normalizedText),
        )
        .take(MAX_MAP_ROWS_PER_TEXT);
      const hit = pickMapRow(rows, item.price);
      if (!hit) continue;
      await ctx.db.patch(item._id, { gtin: hit.gtin });
      matched++;
    }
    return matched;
  },
});
