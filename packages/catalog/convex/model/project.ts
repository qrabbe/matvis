import type { MutationCtx } from '../_generated/server';
import type { DataModel, Doc } from '../_generated/dataModel';
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
 * The part of a clean row a projector produces. Provenance (`store`,
 * `sourceTable`, `sourceId`) comes from the registry entry and the raw row id,
 * so a projector never has to repeat it.
 */
export type ProjectedFields = Omit<
  CleanFields,
  'store' | 'sourceTable' | 'sourceId'
>;

/**
 * Pure, synchronous projection of one raw row into clean fields, run on ingest.
 * Returns null to skip the row. A projector only reshapes fields already present
 * on its own raw row. Anything needing I/O or cross-row reconciliation belongs in
 * a later async enrichment pass, not here.
 */
export type Projector<Raw> = (doc: Raw) => ProjectedFields | null;

/** Raw tables that feed the clean catalog. One projector per table. */
export type SourceTable = Extract<keyof DataModel, `raw_${string}`>;

/**
 * Project a raw Coop product into clean fields. Returns null when the row has no
 * EAN or no name — the clean table requires both, so such rows are skipped.
 */
export const projectCoop: Projector<Doc<'raw_coop'>> = (doc) => {
  if (!doc.ean || !doc.name) return null;
  return { ean: doc.ean, name: doc.name };
};

/**
 * Every raw table's projector plus the store slug its rows belong to. Adding a
 * chain means adding its `raw_<chain>` table and one entry here; the type makes
 * a missing entry a compile error.
 */
export const projectors: {
  [T in SourceTable]: { store: string; project: Projector<Doc<T>> };
} = {
  raw_coop: { store: 'coop', project: projectCoop },
};

/**
 * Run the registered projector for a raw table and attach provenance. Returns
 * null when the projector skips the row.
 */
export function project<T extends SourceTable>(
  table: T,
  doc: Doc<T>,
): CleanFields | null {
  const { store, project: projector } = projectors[table];
  const projected = projector(doc);
  if (!projected) return null;
  return { ...projected, store, sourceTable: table, sourceId: doc._id };
}

/**
 * Upsert one clean `catalog` row keyed by (store, EAN) — every source keeps its
 * own row for a shared EAN, and readers dedup across stores. Patches an existing
 * row, else inserts and bumps the catalog counter. Returns true when a new row
 * was inserted.
 */
export async function upsertClean(
  ctx: MutationCtx,
  fields: CleanFields,
): Promise<boolean> {
  const existing = await ctx.db
    .query('catalog')
    .withIndex('by_store_ean', (q) =>
      q.eq('store', fields.store).eq('ean', fields.ean),
    )
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return false;
  }
  await ctx.db.insert('catalog', fields);
  await bumpCounter(ctx, CATALOG_COUNT_KEY, 1);
  return true;
}
