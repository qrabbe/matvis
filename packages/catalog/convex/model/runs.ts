import { internal } from '../_generated/api';
import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import {
  errorText,
  RUN_HISTORY_PAGE,
  RUN_LOG_PAGE,
  RUN_LOG_TRIM,
  RUN_LOG_TTL_MS,
  type RunKind,
  type RunPoint,
  type RunSummary,
} from './ingest';

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
 * row of those reads as the pipeline having stopped finding things.
 *
 * `drain` and `fill` stay the stored run kinds even though the functions that
 * log them were renamed. Narrowing a stored union means every older row fails
 * validation at push time, and this log is exactly what the automation gate
 * wants weeks of. */
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

/** Holds no database access of its own, reaching everything through
 * `ctx.runQuery` and `ctx.runMutation`, so a run body is free to live in either
 * runtime. Worth keeping for that reason alone now that the Node-runtime caller
 * it was originally written for is gone.
 *
 * The pause check above the body runs once, when the run opens. A body that
 * loops has to call the `paused` probe it is handed between rounds, or pause
 * cannot reach it until the whole loop is over. A body that breaks on a true
 * probe settles as `paused` rather than `ok` and keeps whatever it got through
 * before stopping. */
export async function loggedRun<T extends RunSummary>(
  ctx: ActionCtx,
  kind: RunKind,
  whenPaused: T | null,
  body: (paused: () => Promise<boolean>) => Promise<T>,
): Promise<T> {
  const runId = await ctx.runMutation(internal.runLog.openRun, { kind });
  const readPaused = () => ctx.runQuery(internal.runLog.isPaused, {});
  if (whenPaused !== null && (await readPaused())) {
    await ctx.runMutation(internal.runLog.closeRun, {
      runId,
      status: 'paused',
    });
    return whenPaused;
  }

  let stopped = false;
  const probe = async (): Promise<boolean> => {
    stopped = await readPaused();
    return stopped;
  };

  try {
    const summary = await body(probe);
    await ctx.runMutation(internal.runLog.closeRun, {
      runId,
      status: stopped ? 'paused' : 'ok',
      summary,
    });
    return summary;
  } catch (error) {
    await ctx.runMutation(internal.runLog.closeRun, {
      runId,
      status: 'error',
      error: errorText(error),
    });
    throw error;
  }
}
