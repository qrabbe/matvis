import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { runKindValidator, runSummaryValidator } from './model/ingest';
import { insertRun, settleRun } from './model/runs';
import { readPaused } from './model/queue';

/** The three of these exist because `loggedRun` drives a run from an action,
 * and an action has no `ctx.db`. They are the database half of it, nothing
 * more. `openRun` and `closeRun` cannot be one function: they bracket the run
 * body. */

export const isPaused = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => await readPaused(ctx),
});

export const openRun = internalMutation({
  args: { kind: runKindValidator },
  returns: v.id('ingest_runs'),
  handler: async (ctx, { kind }) => await insertRun(ctx, kind),
});

export const closeRun = internalMutation({
  args: {
    runId: v.id('ingest_runs'),
    status: v.union(v.literal('ok'), v.literal('paused'), v.literal('error')),
    summary: v.optional(runSummaryValidator),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { runId, status, summary, error }) => {
    await settleRun(ctx, runId, { status, summary, error });
    return null;
  },
});
