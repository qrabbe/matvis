import type { StoreSlug } from '@matvis/shared';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { QueueStatus } from './ingest';

export const CATALOG_COUNT_KEY = 'catalog';

export const EANS_COUNT_KEY = 'eans';

export function queueCountKey(status: QueueStatus): string {
  return `queue:${status}`;
}

/** Per store totals live here rather than behind a `by_store` index, which is
 * the trade that keeps `catalog` down to two indexes. */
export function catalogStoreKey(store: StoreSlug): string {
  return `catalog:${store}`;
}

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
 * land in one transaction. */
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
