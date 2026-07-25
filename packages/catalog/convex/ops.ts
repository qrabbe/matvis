import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import {
  runKindValidator,
  runSummaryValidator,
  MAX_ERROR_LENGTH,
} from './model/ingest';
import { insertRun, readPaused, settleRun } from './model/ops';

/**
 * Ingest control state: the pause switch and the run log.
 *
 * Every function here is internal, for the same reason `ingest.ts` gives. They
 * exist so an ACTION can reach this state, which is the whole reason they are
 * registered functions rather than the plain helpers in `model/ops.ts` that the
 * queries and mutations use directly. The one caller is `model/runs.ts`.
 */

/** Whether ingest is paused. Read at the top of every worker batch. */
export const isPaused = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => await readPaused(ctx),
});

/** Open a run row for an action that is starting. */
export const startRun = internalMutation({
  args: { kind: runKindValidator },
  returns: v.id('ingest_runs'),
  handler: async (ctx, { kind }) => await insertRun(ctx, kind),
});

/** Settle an open run row with the action's summary, or with how it failed. */
export const finishRun = internalMutation({
  args: {
    runId: v.id('ingest_runs'),
    status: v.union(v.literal('ok'), v.literal('paused'), v.literal('error')),
    summary: v.optional(runSummaryValidator),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { runId, status, summary, error }) => {
    await settleRun(ctx, runId, {
      status,
      summary,
      error: error?.slice(0, MAX_ERROR_LENGTH),
    });
    return null;
  },
});
