import { internal } from '../_generated/api';
import type { ActionCtx } from '../_generated/server';
import { errorText, type RunKind, type RunSummary } from './ingest';

/**
 * Run one ingest action invocation as a logged run.
 *
 * Writes an `ingest_runs` row before the work and settles it with the summary
 * the action returns, or with the error it threw. Fire-and-forget scheduling is
 * what makes this necessary: nobody is holding the promise, so the outcome has
 * to land somewhere readable.
 *
 * `whenPaused` is returned instead of calling `body` while the pause switch is
 * on, and the run is recorded as `paused`. Pass null for an action pause does
 * not stop, which is discovery: reading the sitemap is one harmless request, and
 * what pause actually has to prevent is the drain it schedules afterwards.
 *
 * Deliberately holds no database access of its own, so `coop/discovery.ts` can
 * use it and still be flipped to the Node runtime.
 */
export async function loggedRun<T extends RunSummary>(
  ctx: ActionCtx,
  kind: RunKind,
  whenPaused: T | null,
  body: () => Promise<T>,
): Promise<T> {
  const runId = await ctx.runMutation(internal.ops.startRun, { kind });
  if (whenPaused !== null && (await ctx.runQuery(internal.ops.isPaused, {}))) {
    await ctx.runMutation(internal.ops.finishRun, { runId, status: 'paused' });
    return whenPaused;
  }
  try {
    const summary = await body();
    await ctx.runMutation(internal.ops.finishRun, {
      runId,
      status: 'ok',
      summary,
    });
    return summary;
  } catch (error) {
    await ctx.runMutation(internal.ops.finishRun, {
      runId,
      status: 'error',
      error: errorText(error),
    });
    throw error;
  }
}
