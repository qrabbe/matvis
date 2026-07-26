import { QueryCtx, MutationCtx } from '../_generated/server';
import type { QueueStatus } from './ingest';

/** Counter key for the clean `catalog` table row count. */
export const CATALOG_COUNT_KEY = 'catalog';

/**
 * Counter key for queue rows sitting in one status.
 *
 * These exist because the admin console's overview is a LIVE query whose read
 * set used to be most of the queue table: counting five statuses by scanning
 * them meant every claim and every settle invalidated the subscription and
 * re-read thousands of documents. Five point reads have a read set of five rows,
 * so a drain no longer re-runs the dashboard against the whole table.
 */
export function queueCountKey(status: QueueStatus): string {
  return `queue:${status}`;
}

/**
 * Counter key for `raw_coop` rows that have never been fetched.
 *
 * Same reason as {@link queueCountKey}, and a worse offender: the scan it
 * replaces read up to a thousand FULL Coop payloads (~3 kB each) to count how
 * many were missing one field.
 */
export const NEVER_FETCHED_KEY = 'raw_coop:neverFetched';

/**
 * Read a maintained counter's value (0 if it has never been written).
 * O(1) reads a single row instead of scanning the counted table.
 */
export async function readCounter(ctx: QueryCtx, key: string): Promise<number> {
  const row = await ctx.db
    .query('app_counters')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  return row?.value ?? 0;
}

/**
 * Adjust a maintained counter by `delta`, creating the row if missing.
 * Call from the same mutation that performs the corresponding insert/delete so
 * the two stay consistent within one transaction.
 */
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

/** Set a maintained counter to an absolute value (used by backfills). */
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
