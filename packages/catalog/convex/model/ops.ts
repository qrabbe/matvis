import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import type { WithoutSystemFields } from 'convex/server';
import {
  QUEUE_STATUSES,
  RUN_LOG_PAGE,
  RUN_LOG_TRIM,
  RUN_LOG_TTL_MS,
  type QueueStatus,
  type RunKind,
  type RunSummary,
} from './ingest';
import {
  bumpCounter,
  queueCountKey,
  readCounter,
  NEVER_FETCHED_KEY,
} from './counters';

/**
 * Plain database helpers behind both the internal ingest functions and the admin
 * console's public surface.
 *
 * They live here rather than in `ingest.ts` because a Convex query cannot call
 * another query: `admin.overview` runs inside a `QueryCtx` of its own, so the
 * only way for it and `ingest.queueStats` to answer identically is for both to
 * call the same function.
 */

// ── Queue writes ─────────────────────────────────────────────────────────────

/**
 * The queue's status counts are maintained rather than counted, so every write
 * to `coop_ingest_queue` has to go through one of the three helpers below.
 *
 * That rule is the whole design. A counter is only as good as the write path
 * that maintains it, and "remember to bump the counter" is exactly the kind of
 * thing the next edit forgets — so `ingest.ts` never calls `ctx.db.insert`,
 * `ctx.db.patch` or `ctx.db.delete` on this table directly. Grep it for
 * `coop_ingest_queue` and every write is one of these. If a count ever does
 * drift, `backfill.rebuildCounters` recomputes all of them from the rows.
 */

type QueueRowFields = WithoutSystemFields<Doc<'coop_ingest_queue'>>;

/** Insert a queue row and count it. */
export async function insertQueueRow(
  ctx: MutationCtx,
  fields: QueueRowFields,
): Promise<Id<'coop_ingest_queue'>> {
  await bumpCounter(ctx, queueCountKey(fields.status), 1);
  return await ctx.db.insert('coop_ingest_queue', fields);
}

/**
 * Move a loaded queue row to `status`, applying `extra` in the same patch, and
 * move the counters with it. The status a row is LEAVING is what a counter needs
 * and what a blind patch does not know, which is why this takes the document.
 */
export async function setQueueStatus(
  ctx: MutationCtx,
  row: Doc<'coop_ingest_queue'>,
  status: QueueStatus,
  extra: Partial<QueueRowFields> = {},
): Promise<void> {
  if (row.status !== status) {
    await bumpCounter(ctx, queueCountKey(row.status), -1);
    await bumpCounter(ctx, queueCountKey(status), 1);
  }
  await ctx.db.patch(row._id, { ...extra, status });
}

/**
 * {@link setQueueStatus} for a caller holding only an id, which is the worker
 * settling a batch it claimed in an earlier transaction. Costs one point read of
 * a ~200-byte row, and is a no-op on a row that has since been deleted — a
 * settle racing a `removeQueueRows` can land there.
 */
export async function setQueueStatusById(
  ctx: MutationCtx,
  id: Id<'coop_ingest_queue'>,
  status: QueueStatus,
  extra: Partial<QueueRowFields> = {},
): Promise<void> {
  const row = await ctx.db.get(id);
  if (row) await setQueueStatus(ctx, row, status, extra);
}

/** Delete a queue row and uncount it. Takes the loaded row, because every caller
 * already read it to decide it should go. */
export async function deleteQueueRow(
  ctx: MutationCtx,
  row: Doc<'coop_ingest_queue'>,
): Promise<void> {
  await bumpCounter(ctx, queueCountKey(row.status), -1);
  await ctx.db.delete(row._id);
}

// ── Stats ────────────────────────────────────────────────────────────────────

export type QueueStats = {
  pending: number;
  processing: number;
  done: number;
  skipped: number;
  failed: number;
};

/**
 * Rows per queue status, read from the maintained counters — five point reads,
 * exact, and with a read set of five rows rather than most of the table.
 *
 * It used to scan the head of each status and cap the count at a thousand. That
 * made the console's live overview re-read ~5,000 documents every time a drain
 * touched a single queue row, which is how one dashboard came to account for the
 * bulk of the deployment's read traffic. Counts are now exact, so there is no
 * ceiling to render around.
 */
export async function readQueueStats(ctx: QueryCtx): Promise<QueueStats> {
  const counts = await Promise.all(
    QUEUE_STATUSES.map((status) => readCounter(ctx, queueCountKey(status))),
  );
  return {
    pending: counts[0],
    processing: counts[1],
    done: counts[2],
    skipped: counts[3],
    failed: counts[4],
  };
}

export type FreshnessStats = {
  neverFetched: number;
  oldestFetchedAt: number | null;
};

/**
 * How stale the catalog is: how many `raw_coop` rows have never been fetched,
 * and when the oldest fetched row was last seen.
 *
 * The count comes from {@link NEVER_FETCHED_KEY}; the timestamp is ONE document.
 * `gt('lastFetchedAt', 0)` is what makes it one: Convex sorts a missing field
 * before any number, so the range starts immediately after the never-fetched
 * rows and the first row in it is the stalest fetched one. The previous version
 * walked through those never-fetched rows to reach it, reading up to a thousand
 * full Coop payloads — about 3 MB — on every re-run of a live subscription.
 */
export async function readFreshnessStats(
  ctx: QueryCtx,
): Promise<FreshnessStats> {
  const oldest = await ctx.db
    .query('raw_coop')
    .withIndex('by_lastFetchedAt', (q) => q.gt('lastFetchedAt', 0))
    .first();
  return {
    neverFetched: await readCounter(ctx, NEVER_FETCHED_KEY),
    oldestFetchedAt: oldest?.lastFetchedAt ?? null,
  };
}

/**
 * Stamp a `raw_coop` row as fetched now, keeping {@link NEVER_FETCHED_KEY}
 * honest. Every write that sets `lastFetchedAt` on a row that did not have one
 * goes through here or through the equivalent bump in `raw.upsertCoopByEan`,
 * which is the only other place the field is written.
 */
export async function stampFetched(
  ctx: MutationCtx,
  row: Doc<'raw_coop'>,
  at: number,
): Promise<void> {
  if (row.lastFetchedAt === undefined) {
    await bumpCounter(ctx, NEVER_FETCHED_KEY, -1);
  }
  await ctx.db.patch(row._id, { lastFetchedAt: at });
}

/** Whether ingest is paused. Defaults to running, so a deployment with no
 * settings row behaves exactly as it did before the switch existed. */
export async function readPaused(ctx: QueryCtx): Promise<boolean> {
  const row = await ctx.db.query('ingest_settings').first();
  return row?.paused ?? false;
}

/** Set the pause switch, creating the singleton row on first use. */
export async function writePaused(
  ctx: MutationCtx,
  paused: boolean,
): Promise<void> {
  const row = await ctx.db.query('ingest_settings').first();
  const fields = { paused, updatedAt: Date.now() };
  if (row) {
    await ctx.db.patch(row._id, fields);
  } else {
    await ctx.db.insert('ingest_settings', fields);
  }
}

/**
 * Open a run row for an action that is about to start, sweeping a bounded slice
 * of expired rows on the way through. Ascending order means the sweep only ever
 * looks at the oldest {@link RUN_LOG_TRIM} rows, so logging a run costs the same
 * whether the log is empty or months deep.
 */
export async function insertRun(
  ctx: MutationCtx,
  kind: RunKind,
): Promise<Id<'ingest_runs'>> {
  const now = Date.now();
  const oldest = await ctx.db.query('ingest_runs').take(RUN_LOG_TRIM);
  for (const row of oldest) {
    if (row.startedAt < now - RUN_LOG_TTL_MS) await ctx.db.delete(row._id);
  }
  return await ctx.db.insert('ingest_runs', {
    kind,
    status: 'running',
    startedAt: now,
  });
}

/** Settle an open run row with what the action returned or threw. */
export async function settleRun(
  ctx: MutationCtx,
  runId: Id<'ingest_runs'>,
  outcome: {
    status: 'ok' | 'paused' | 'error';
    summary?: RunSummary;
    error?: string;
  },
): Promise<void> {
  await ctx.db.patch(runId, {
    status: outcome.status,
    finishedAt: Date.now(),
    summary: outcome.summary,
    error: outcome.error,
  });
}

/** The newest {@link RUN_LOG_PAGE} runs, newest first. */
export async function readRecentRuns(ctx: QueryCtx) {
  return await ctx.db.query('ingest_runs').order('desc').take(RUN_LOG_PAGE);
}
