import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';

/**
 * Rebuild the clean `catalog` table from every `raw_coop` row. Idempotent: reruns
 * patch existing clean rows rather than duplicating. Run once after the step-04
 * import. Returns how many raw pages and new clean rows it produced.
 *
 * This is the reproject-everything tool: re-run it whenever `CleanFields` or any
 * projector changes, so existing clean rows pick up the new shape. When async
 * enrichment lands it should run the enrichers here too.
 */
export const rebuildCleanFromRaw = internalAction({
  args: { batchSize: v.optional(v.number()) },
  returns: v.object({ pages: v.number(), inserted: v.number() }),
  handler: async (ctx, { batchSize }) => {
    const numItems = batchSize ?? 200;
    let cursor: string | null = null;
    let pages = 0;
    let inserted = 0;
    for (;;) {
      const page = await ctx.runQuery(internal.raw.pageRawCoop, {
        cursor,
        numItems,
      });
      if (page.items.length > 0) {
        inserted += await ctx.runMutation(internal.raw.upsertCleanBatch, {
          items: page.items,
        });
      }
      pages += 1;
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    return { pages, inserted };
  },
});
