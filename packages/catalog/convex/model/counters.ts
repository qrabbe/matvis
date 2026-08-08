import type { StoreSlug } from '@matvis/shared';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { QueueStatus } from './ingest';

export const CATALOG_COUNT_KEY = 'catalog';

export const EANS_COUNT_KEY = 'eans';

/** Rows carrying a `fetchedAt` at all. Maintained rather than bucketed by age
 * on purpose: an age bucket moves as time passes without anything writing to
 * the row, so a maintained bucket count would be wrong by tomorrow. Whether a
 * row has ever been verified only ever changes on a write, so this one is
 * exact and stays exact. */
export const CATALOG_VERIFIED_KEY = 'catalog:verified';

export function queueCountKey(status: QueueStatus): string {
  return `queue:${status}`;
}

/** Per store totals live here rather than behind a `by_store` index, which is
 * the trade that keeps `catalog` down to two indexes. */
export function catalogStoreKey(store: StoreSlug): string {
  return `catalog:${store}`;
}

/** The optional fields worth measuring coverage on. Everything past the
 * identity block is optional, which is exactly why the share carrying each one
 * is worth knowing rather than assuming: it says whether ingest is degrading,
 * and it is the measured version of the numbers the developer page used to
 * assert from memory.
 *
 * The same shape the ICA spike used, so the two chains stay comparable. */
export const COVERAGE_FIELDS = [
  'brand',
  'imageUrl',
  'netContent',
  'categoryPath',
  'countryOfOrigin',
  'labels',
  'food',
  'foodIngredients',
  'foodNutrition',
] as const;

export type CoverageField = (typeof COVERAGE_FIELDS)[number];

export function coverageKey(field: CoverageField): string {
  return `coverage:${field}`;
}

/** When the coverage recount last ran, in unix ms, stored as a counter because
 * that is the one table already built for stray numbers. A coverage share
 * without the date it was measured is the same mistake the developer page made
 * the first time. */
export const COVERAGE_MEASURED_AT_KEY = 'coverage:measuredAt';

function counterRow(ctx: QueryCtx, key: string) {
  return ctx.db
    .query('app_counters')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
}

export async function readCounter(ctx: QueryCtx, key: string): Promise<number> {
  const row = await counterRow(ctx, key);
  return row?.value ?? 0;
}

async function writeCounter(
  ctx: MutationCtx,
  key: string,
  next: (current: number) => number,
): Promise<void> {
  const row = await counterRow(ctx, key);
  const value = next(row?.value ?? 0);
  if (row) {
    await ctx.db.patch(row._id, { value });
  } else {
    await ctx.db.insert('app_counters', { key, value });
  }
}

/** Call from the same mutation as the insert or delete it counts, so the two
 * land in one transaction.
 *
 * The catalog keys have no decrement path today because nothing deletes a
 * catalog row. Anything that starts to must decrement all three of them
 * (`CATALOG_COUNT_KEY`, the store key and `CATALOG_VERIFIED_KEY`) through one
 * guarded helper, or every total on the console and the site header drifts
 * silently. See DECISIONS.md, "Delisting". */
export async function bumpCounter(
  ctx: MutationCtx,
  key: string,
  delta: number,
): Promise<void> {
  await writeCounter(ctx, key, (current) => current + delta);
}

export async function setCounter(
  ctx: MutationCtx,
  key: string,
  value: number,
): Promise<void> {
  await writeCounter(ctx, key, () => value);
}
