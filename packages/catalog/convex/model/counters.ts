import { QueryCtx, MutationCtx } from '../_generated/server';
import type { QueueStatus } from './ingest';

export const CATALOG_COUNT_KEY = 'catalog';

export function queueCountKey(status: QueueStatus): string {
  return `queue:${status}`;
}

export const NEVER_FETCHED_KEY = 'raw_coop:neverFetched';

export async function readCounter(ctx: QueryCtx, key: string): Promise<number> {
  const row = await ctx.db
    .query('app_counters')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  return row?.value ?? 0;
}

/** Call from the same mutation as the insert or delete it counts, so the two
 * land in one transaction. */
export async function bumpCounter(
  ctx: MutationCtx,
  key: string,
  delta: number,
): Promise<void> {
  const row = await ctx.db
    .query('app_counters')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if (row) {
    await ctx.db.patch(row._id, { value: row.value + delta });
  } else {
    await ctx.db.insert('app_counters', { key, value: delta });
  }
}

export async function setCounter(
  ctx: MutationCtx,
  key: string,
  value: number,
): Promise<void> {
  const row = await ctx.db
    .query('app_counters')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if (row) {
    await ctx.db.patch(row._id, { value });
  } else {
    await ctx.db.insert('app_counters', { key, value });
  }
}
