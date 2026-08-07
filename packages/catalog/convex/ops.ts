import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { runKindValidator, runSummaryValidator } from './model/ingest';
import { insertRun, readPaused, settleRun } from './model/ops';

export const isPaused = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => await readPaused(ctx),
});

export const startRun = internalMutation({
  args: { kind: runKindValidator },
  returns: v.id('ingest_runs'),
  handler: async (ctx, { kind }) => await insertRun(ctx, kind),
});

export const finishRun = internalMutation({
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
