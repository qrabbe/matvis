import { internal } from '../_generated/api';
import type { ActionCtx } from '../_generated/server';
import { errorText, type RunKind, type RunSummary } from './ingest';

/** Holds no database access of its own, so `coop/discovery.ts` can use it and
 * still be flipped to the Node runtime. */
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
