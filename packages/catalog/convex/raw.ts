import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { coopProductInformationFields } from './schemes/coop';
import { catalogFields } from './model/fields';
import { project, upsertClean } from './model/project';

/** One clean row as it travels between the paging query and the batch upsert. */
const cleanFields = v.object(catalogFields);

/**
 * Ingest one Coop product: upsert `raw_coop` by EAN, then project into the clean
 * `catalog` table. The single write path every Coop scraper calls. Returns the
 * raw row id.
 *
 * `lastFetchedAt` is stamped here rather than passed in, so that every caller —
 * queue worker, refresh sweep, a one-off `convex run` — records freshness the
 * same way and none of them can forget to.
 *
 * `replace` rather than `patch`, for the reason `upsertClean` gives: a patch
 * keeps keys the incoming payload does not have, so a promotion that ended or a
 * field Coop dropped would linger on the raw row forever. That only started
 * mattering once rows are re-fetched — a fetch IS the row.
 */
export const upsertCoopByEan = internalMutation({
  args: { data: v.object(coopProductInformationFields) },
  returns: v.id('raw_coop'),
  handler: async (ctx, { data }) => {
    const row = { ...data, lastFetchedAt: Date.now() };
    const existing = data.ean
      ? await ctx.db
          .query('raw_coop')
          .withIndex('by_ean', (q) => q.eq('ean', data.ean!))
          .first()
      : null;
    const rawId = existing
      ? (await ctx.db.replace(existing._id, row), existing._id)
      : await ctx.db.insert('raw_coop', row);

    const raw = (await ctx.db.get(rawId))!;
    const clean = project('raw_coop', raw);
    if (clean) await upsertClean(ctx, clean);
    return rawId;
  },
});

/** One page of clean fields projected from `raw_coop`, for the backfill action. */
export const pageRawCoop = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), numItems: v.number() },
  returns: v.object({
    items: v.array(cleanFields),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { cursor, numItems }) => {
    const page = await ctx.db.query('raw_coop').paginate({ cursor, numItems });
    const items = page.page.flatMap((doc) => {
      const clean = project('raw_coop', doc);
      return clean ? [clean] : [];
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
  args: { items: v.array(cleanFields) },
  returns: v.number(),
  handler: async (ctx, { items }) => {
    let inserted = 0;
    for (const fields of items) {
      if (await upsertClean(ctx, fields)) inserted += 1;
    }
    return inserted;
  },
});
