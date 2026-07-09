import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { coopProductInformationFields } from './schemes/coop';
import { projectCoop, upsertClean, type CleanFields } from './model/project';

/**
 * Ingest one Coop product: upsert `raw_coop` by EAN, then project into the clean
 * `catalog` table. The single write path every Coop scraper calls. Returns the
 * raw row id.
 */
export const upsertCoopByEan = internalMutation({
  args: { data: v.object(coopProductInformationFields) },
  returns: v.id('raw_coop'),
  handler: async (ctx, { data }) => {
    const existing = data.ean
      ? await ctx.db
          .query('raw_coop')
          .withIndex('by_ean', (q) => q.eq('ean', data.ean!))
          .first()
      : null;
    const rawId = existing
      ? (await ctx.db.patch(existing._id, data), existing._id)
      : await ctx.db.insert('raw_coop', data);

    const raw = (await ctx.db.get(rawId))!;
    const projected = projectCoop(raw);
    if (projected) {
      await upsertClean(ctx, {
        ...projected,
        store: 'coop',
        sourceTable: 'raw_coop',
        sourceId: rawId,
      });
    }
    return rawId;
  },
});

/** One page of clean fields projected from `raw_coop`, for the backfill action. */
export const pageRawCoop = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), numItems: v.number() },
  returns: v.object({
    items: v.array(
      v.object({
        ean: v.string(),
        name: v.string(),
        sourceId: v.id('raw_coop'),
      }),
    ),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { cursor, numItems }) => {
    const page = await ctx.db.query('raw_coop').paginate({ cursor, numItems });
    const items = page.page.flatMap((doc) => {
      const p = projectCoop(doc);
      return p ? [{ ...p, sourceId: doc._id }] : [];
    });
    return {
      items,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** Upsert a batch of clean rows (used by the backfill). Returns rows inserted. */
export const upsertCleanBatch = internalMutation({
  args: {
    items: v.array(
      v.object({
        ean: v.string(),
        name: v.string(),
        sourceId: v.id('raw_coop'),
      }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, { items }) => {
    let inserted = 0;
    for (const it of items) {
      const fields: CleanFields = {
        ean: it.ean,
        name: it.name,
        store: 'coop',
        sourceTable: 'raw_coop',
        sourceId: it.sourceId,
      };
      if (await upsertClean(ctx, fields)) inserted += 1;
    }
    return inserted;
  },
});
