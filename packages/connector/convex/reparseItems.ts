'use node';
// Action-only, same reason as sync.ts: PDF parsing needs the Node runtime.
// One-off maintenance, run by a developer via `bunx convex run reparseItems`
// after the parser learns to read weight/multiple lines it used to drop —
// existing receipts were stored with whatever the parser produced at sync
// time, and nothing re-derives them automatically.
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { parseCoopReceiptItems } from '../src/coop/parse/items';
import { extractPdfText } from '../src/coop/parse/extract-pdf';

export const reparseCoopReceipts = internalAction({
  args: {},
  returns: v.object({
    receiptsScanned: v.number(),
    receiptsChanged: v.number(),
    itemsPatched: v.number(),
    receiptsSkippedMismatch: v.number(),
  }),
  handler: async (ctx) => {
    const totals = {
      receiptsScanned: 0,
      receiptsChanged: 0,
      itemsPatched: 0,
      receiptsSkippedMismatch: 0,
    };
    let cursor: string | null = null;

    for (;;) {
      const page = await ctx.runQuery(
        internal.model.reparseItems.receiptsPage,
        { cursor },
      );

      for (const receipt of page.page) {
        totals.receiptsScanned++;

        const blob = await ctx.storage.get(receipt.pdfStorageId);
        if (!blob) continue;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const text = await extractPdfText(bytes);
        const reparsed = parseCoopReceiptItems(text);

        const existing = await ctx.runQuery(
          internal.model.reparseItems.receiptItemsForReceipt,
          { receiptId: receipt._id },
        );

        if (existing.length !== reparsed.length) {
          totals.receiptsSkippedMismatch++;
          continue;
        }

        const patches: {
          itemId: Id<'receiptItems'>;
          quantity: number;
          unit: string;
        }[] = [];
        let mismatched = false;
        for (let i = 0; i < existing.length; i++) {
          const current = existing[i]!;
          const fresh = reparsed[i]!;
          if (current.text !== fresh.text) {
            mismatched = true;
            break;
          }
          const alreadySet =
            current.quantity === fresh.quantity && current.unit === fresh.unit;
          if (!alreadySet && fresh.quantity !== undefined && fresh.unit) {
            patches.push({
              itemId: current._id,
              quantity: fresh.quantity,
              unit: fresh.unit,
            });
          }
        }

        if (mismatched) {
          totals.receiptsSkippedMismatch++;
          continue;
        }

        if (patches.length > 0) {
          const patched = await ctx.runMutation(
            internal.model.reparseItems.patchItemQuantities,
            { patches },
          );
          totals.itemsPatched += patched;
          if (patched > 0) totals.receiptsChanged++;
        }
      }

      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    return totals;
  },
});
