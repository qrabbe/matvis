import type { MutationCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { bumpCounter, CATALOG_COUNT_KEY } from './counters';

/** Fields a clean `catalog` row carries (minus system fields). */
export type CleanFields = {
  ean: string;
  name: string;
  store: string;
  sourceTable: string;
  sourceId: string;
};

/**
 * Project a raw Coop product into clean fields. Returns null when the row has no
 * EAN or no name — the clean table requires both, so such rows are skipped.
 */
export function projectCoop(
  doc: Doc<'raw_coop'>,
): Pick<CleanFields, 'ean' | 'name'> | null {
  if (!doc.ean || !doc.name) return null;
  return { ean: doc.ean, name: doc.name };
}

/**
 * Upsert one clean `catalog` row keyed by EAN. Patches an existing row, else
 * inserts and bumps the catalog counter. Returns true when a new row was inserted.
 */
export async function upsertClean(
  ctx: MutationCtx,
  fields: CleanFields,
): Promise<boolean> {
  const existing = await ctx.db
    .query('catalog')
    .withIndex('by_ean', (q) => q.eq('ean', fields.ean))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return false;
  }
  await ctx.db.insert('catalog', fields);
  await bumpCounter(ctx, CATALOG_COUNT_KEY, 1);
  return true;
}
