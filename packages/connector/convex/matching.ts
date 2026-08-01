import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { normalizeItemText } from '@matvis/shared';
import { MAX_RECEIPT_ITEMS } from './validators';

/**
 * Fill `gtin` on a receipt's unmatched lines from the `itemGtinMap` lookup.
 * Scheduled right after the receipt is inserted (see model/receipts.ts).
 *
 * This is the seam for the matching engine, not the engine: it only resolves
 * text already in the map, so with an empty map it is a no-op. Inferring EANs
 * for unknown lines is the engine's job, and it fills the map offline — the
 * connector never calls the catalog at runtime. Returns how many lines matched.
 */
export const matchReceipt = internalMutation({
  args: { receiptId: v.id('receipts') },
  returns: v.number(),
  handler: async (ctx, { receiptId }) => {
    const receipt = await ctx.db.get(receiptId);
    if (!receipt) return 0;

    const items = await ctx.db
      .query('receiptItems')
      .withIndex('by_receipt', (q) => q.eq('receiptId', receiptId))
      // Bounded to the same ceiling `receipts.getReceipt` reads a receipt at:
      // a single receipt never has thousands of lines, and this runs inside a
      // mutation whose read budget a malformed import should not be able to eat.
      .take(MAX_RECEIPT_ITEMS);

    let matched = 0;
    for (const item of items) {
      // Already matched, or a discount line, which names no product.
      if (item.gtin !== undefined || item.isDiscount) continue;
      const normalizedText = normalizeItemText(item.text);
      if (normalizedText === '') continue;
      const hit = await ctx.db
        .query('itemGtinMap')
        .withIndex('by_store_text', (q) =>
          q.eq('store', receipt.source).eq('normalizedText', normalizedText),
        )
        // `first`, not `unique`: a duplicated map row should not fail a sync.
        .first();
      if (!hit) continue;
      await ctx.db.patch(item._id, { gtin: hit.gtin });
      matched++;
    }
    return matched;
  },
});
