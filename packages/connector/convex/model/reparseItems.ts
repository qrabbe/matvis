import { v } from 'convex/values';
import { internalMutation, internalQuery } from '../_generated/server';

export const REPARSE_PAGE_SIZE = 25;

export const receiptsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    page: v.array(
      v.object({ _id: v.id('receipts'), pdfStorageId: v.id('_storage') }),
    ),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db
      .query('receipts')
      .paginate({ cursor, numItems: REPARSE_PAGE_SIZE });
    return {
      page: result.page.flatMap((r) =>
        r.source === 'coop' && r.pdfStorageId
          ? [{ _id: r._id, pdfStorageId: r.pdfStorageId }]
          : [],
      ),
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const receiptItemsForReceipt = internalQuery({
  args: { receiptId: v.id('receipts') },
  returns: v.array(
    v.object({
      _id: v.id('receiptItems'),
      lineNo: v.number(),
      text: v.string(),
      quantity: v.optional(v.number()),
      unit: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { receiptId }) => {
    const items = await ctx.db
      .query('receiptItems')
      .withIndex('by_receipt', (q) => q.eq('receiptId', receiptId))
      .collect();
    return items
      .sort((a, b) => a.lineNo - b.lineNo)
      .map(({ _id, lineNo, text, quantity, unit }) => ({
        _id,
        lineNo,
        text,
        quantity,
        unit,
      }));
  },
});

/** Patches only the rows the reparse actually changed — an item whose text
 * no longer lines up with the freshly parsed text at the same `lineNo` is
 * skipped rather than guessed at, since that means the parser's line count
 * shifted for this receipt and a positional patch would attach the wrong
 * quantity to the wrong item. */
export const patchItemQuantities = internalMutation({
  args: {
    patches: v.array(
      v.object({
        itemId: v.id('receiptItems'),
        quantity: v.number(),
        unit: v.string(),
      }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, { patches }) => {
    let patched = 0;
    for (const { itemId, quantity, unit } of patches) {
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10_000) {
        continue;
      }
      await ctx.db.patch(itemId, { quantity, unit });
      patched++;
    }
    return patched;
  },
});
