import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { normalizeItemText } from '@matvis/shared';
import { MAX_RECEIPT_ITEMS } from './validators';

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
      const hit = await ctx.db
        .query('itemGtinMap')
        .withIndex('by_store_text', (q) =>
          q.eq('store', receipt.source).eq('normalizedText', normalizedText),
        )
        // `first`, not `unique`: a duplicated map row must not fail a sync.
        .first();
      if (!hit) continue;
      await ctx.db.patch(item._id, { gtin: hit.gtin });
      matched++;
    }
    return matched;
  },
});
