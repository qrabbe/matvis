import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import type { WithoutSystemFields } from 'convex/server';
import {
  FRESHNESS_SAMPLE,
  MONTH_MS,
  QUEUE_DEDUP_SCAN,
  QUEUE_STATUSES,
  RUN_HISTORY_PAGE,
  RUN_LOG_PAGE,
  RUN_LOG_TRIM,
  RUN_LOG_TTL_MS,
  WEEK_MS,
  type Coverage,
  type FillStats,
  type Freshness,
  type QueueStats,
  type QueueStatus,
  type RunKind,
  type RunPoint,
  type RunSummary,
} from './ingest';
import {
  bumpCounter,
  coverageKey,
  queueCountKey,
  readCounter,
  CATALOG_COUNT_KEY,
  CATALOG_VERIFIED_KEY,
  COVERAGE_FIELDS,
  COVERAGE_MEASURED_AT_KEY,
  EANS_COUNT_KEY,
} from './counters';

type QueueRowFields = WithoutSystemFields<Doc<'coop_ingest_queue'>>;

/** The queue's status counts are maintained, not counted, so `ingest.ts` never
 * writes `coop_ingest_queue` directly. Every write goes through one of these. */
export async function insertQueueRow(
  ctx: MutationCtx,
  fields: QueueRowFields,
): Promise<Id<'coop_ingest_queue'>> {
  await bumpCounter(ctx, queueCountKey(fields.status), 1);
  return await ctx.db.insert('coop_ingest_queue', fields);
}

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

export async function setQueueStatusById(
  ctx: MutationCtx,
  id: Id<'coop_ingest_queue'>,
  status: QueueStatus,
  extra: Partial<QueueRowFields> = {},
): Promise<void> {
  const row = await ctx.db.get(id);
  if (row) await setQueueStatus(ctx, row, status, extra);
}

export async function deleteQueueRow(
  ctx: MutationCtx,
  row: Doc<'coop_ingest_queue'>,
): Promise<void> {
  await bumpCounter(ctx, queueCountKey(row.status), -1);
  await ctx.db.delete(row._id);
}

export type QueueOutcome = 'queued' | 'known' | 'duplicate';

/** `known` means `catalog` already holds the row, `duplicate` means the queue
 * already carries unfinished work for it. Both callers that add EANs, the paste
 * and the fill sweep, want exactly this decision. */
export async function queueEanIfMissing(
  ctx: MutationCtx,
  ean: string,
  source: string,
  now: number,
): Promise<QueueOutcome> {
  const held = await ctx.db
    .query('catalog')
    .withIndex('by_ean_store', (q) => q.eq('ean', ean).eq('store', 'coop'))
    .first();
  if (held) return 'known';

  const existing = await ctx.db
    .query('coop_ingest_queue')
    .withIndex('by_ean', (q) => q.eq('ean', ean))
    .take(QUEUE_DEDUP_SCAN);
  if (existing.some((row) => row.status !== 'done')) return 'duplicate';

  await insertQueueRow(ctx, {
    ean,
    status: 'pending',
    attempts: 0,
    source,
    enqueuedAt: now,
  });
  return 'queued';
}

export async function readQueueStats(ctx: QueryCtx): Promise<QueueStats> {
  const counts = await Promise.all(
    QUEUE_STATUSES.map((status) => readCounter(ctx, queueCountKey(status))),
  );
  return {
    pending: counts[0]!,
    processing: counts[1]!,
    done: counts[2]!,
    skipped: counts[3]!,
    failed: counts[4]!,
  };
}

/** One row, read once. Every setting on it is reached through here so a handler
 * that wants two of them does not pay for two scans. */
async function readSettings(
  ctx: QueryCtx,
): Promise<Doc<'ingest_settings'> | null> {
  return await ctx.db.query('ingest_settings').first();
}

async function patchSettings(
  ctx: MutationCtx,
  fields: Partial<WithoutSystemFields<Doc<'ingest_settings'>>>,
): Promise<void> {
  const row = await readSettings(ctx);
  const next = { ...fields, updatedAt: Date.now() };
  if (row) {
    await ctx.db.patch(row._id, next);
  } else {
    await ctx.db.insert('ingest_settings', { paused: false, ...next });
  }
}

export async function readPaused(ctx: QueryCtx): Promise<boolean> {
  return (await readSettings(ctx))?.paused ?? false;
}

export async function writePaused(
  ctx: MutationCtx,
  paused: boolean,
): Promise<void> {
  await patchSettings(ctx, { paused });
}

/** `null` means the sweep is at the start of a fresh pass. It wraps back to
 * null on the last page, so the worklist cycles forever. */
export async function readFillCursor(ctx: QueryCtx): Promise<string | null> {
  return (await readSettings(ctx))?.fillCursor ?? null;
}

export async function writeFillCursor(
  ctx: MutationCtx,
  cursor: string | null,
): Promise<void> {
  await patchSettings(ctx, { fillCursor: cursor ?? undefined });
}

export async function readFillStats(ctx: QueryCtx): Promise<FillStats> {
  const settings = await readSettings(ctx);
  return {
    eansKnown: await readCounter(ctx, EANS_COUNT_KEY),
    cursorAtEnd: (settings?.fillCursor ?? null) === null,
  };
}

/** How much of the catalog has ever been verified against the source, and how
 * old the verified rows are.
 *
 * Two different kinds of number, deliberately. `verified` and `never` come from
 * maintained counters and are exact for the whole table. The buckets come from
 * a bounded sample of the most recently added rows, because bucketing the whole
 * table by age is a scan and an age bucket cannot be maintained on write. The
 * sample is biased toward new rows and the console says so; a number without
 * its window is a number that gets misremembered as all-time. */
export async function readFreshness(ctx: QueryCtx): Promise<Freshness> {
  const now = Date.now();
  const total = await readCounter(ctx, CATALOG_COUNT_KEY);
  const verified = await readCounter(ctx, CATALOG_VERIFIED_KEY);

  const sample = await ctx.db
    .query('catalog')
    .order('desc')
    .take(FRESHNESS_SAMPLE);

  const buckets = { week: 0, month: 0, older: 0, never: 0 };
  for (const row of sample) {
    if (row.fetchedAt === undefined) buckets.never += 1;
    else if (row.fetchedAt > now - WEEK_MS) buckets.week += 1;
    else if (row.fetchedAt > now - MONTH_MS) buckets.month += 1;
    else buckets.older += 1;
  }

  return {
    verified,
    never: Math.max(total - verified, 0),
    sample: { size: sample.length, ...buckets },
  };
}

/** What share of rows carry each optional field, as of the last recount.
 *
 * Recount-on-demand rather than maintained on write. Maintaining nine more
 * counters on every upsert is real write cost on the hot path, and a recount is
 * just as honest as long as its timestamp is on screen next to it - which is
 * why `measuredAt` is in the return shape rather than being decoration.
 * `measuredAt` is null before the first recount, and the console says so
 * instead of drawing nine zeroes as if they were measurements. */
export async function readCoverage(ctx: QueryCtx): Promise<Coverage> {
  const measuredAt = await readCounter(ctx, COVERAGE_MEASURED_AT_KEY);
  const fields = await Promise.all(
    COVERAGE_FIELDS.map(async (field) => ({
      field,
      count: await readCounter(ctx, coverageKey(field)),
    })),
  );
  return {
    measuredAt: measuredAt > 0 ? measuredAt : null,
    total: await readCounter(ctx, CATALOG_COUNT_KEY),
    fields,
  };
}

export async function insertRun(
  ctx: MutationCtx,
  kind: RunKind,
): Promise<Id<'ingest_runs'>> {
  const now = Date.now();
  const oldest = await ctx.db
    .query('ingest_runs')
    .order('asc')
    .take(RUN_LOG_TRIM);
  for (const row of oldest) {
    if (row.startedAt < now - RUN_LOG_TTL_MS) await ctx.db.delete(row._id);
  }
  return await ctx.db.insert('ingest_runs', {
    kind,
    status: 'running',
    startedAt: now,
  });
}

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

export async function readRecentRuns(ctx: QueryCtx) {
  return await ctx.db.query('ingest_runs').order('desc').take(RUN_LOG_PAGE);
}

/** Drain runs only, oldest first, flattened to the four numbers the trend
 * plots.
 *
 * Fill runs are excluded rather than drawn as gaps. A fill reports
 * `scanned`/`queued` and never adds a product, so plotting it on an "added"
 * axis would draw a zero for a run that was never capable of a non-zero, and a
 * row of those reads as the pipeline having stopped finding things. */
export async function readRunHistory(ctx: QueryCtx): Promise<RunPoint[]> {
  const runs = await ctx.db
    .query('ingest_runs')
    .order('desc')
    .take(RUN_HISTORY_PAGE);

  return runs
    .filter((run) => run.kind === 'drain')
    .map((run) => ({
      startedAt: run.startedAt,
      kind: run.kind,
      status: run.status,
      added: run.summary?.added ?? 0,
      skipped: run.summary?.skipped ?? 0,
      failed: run.summary?.failed ?? 0,
      claimed: run.summary?.claimed ?? 0,
    }))
    .reverse();
}
