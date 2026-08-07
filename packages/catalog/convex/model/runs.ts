import { internal } from '../_generated/api';
import type { ActionCtx } from '../_generated/server';
import { errorText, type RunKind, type RunSummary } from './ingest';

/** Holds no database access of its own, reaching everything through
 * `ctx.runQuery` and `ctx.runMutation`, so a run body is free to live in either
 * runtime. Worth keeping for that reason alone now that the Node-runtime caller
 * it was originally written for is gone.
 *
 * The pause check above the body runs once, when the run starts. A body that
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
  const runId = await ctx.runMutation(internal.ops.startRun, { kind });
  const readPaused = () => ctx.runQuery(internal.ops.isPaused, {});
  if (whenPaused !== null && (await readPaused())) {
    await ctx.runMutation(internal.ops.finishRun, { runId, status: 'paused' });
    return whenPaused;
  }

  let stopped = false;
  const probe = async (): Promise<boolean> => {
    stopped = await readPaused();
    return stopped;
  };

  try {
    const summary = await body(probe);
    await ctx.runMutation(internal.ops.finishRun, {
      runId,
      status: stopped ? 'paused' : 'ok',
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
