import {
  v,
  type Infer,
  type ObjectType,
  type PropertyValidators,
  type Validator,
} from 'convex/values';
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import {
  SESSION_REVOKE_LIMIT,
  SESSION_SWEEP_LIMIT,
  SESSION_TTL_MS,
  SIGNIN_FAILURE_DELAY_MS,
  SIGNIN_FAILURE_LIMIT,
  SIGNIN_WINDOW_MS,
  delay,
  generateSessionToken,
  secretsMatch,
  sessionLiveByHash,
  sha256Hex,
} from './model/admin';
import {
  DEFAULT_FILL_BATCHES,
  DEFAULT_QUEUE_BATCHES,
  ENQUEUE_CHUNK,
  ENQUEUE_PASTE_MAX,
  MAX_RUN_BATCHES,
  QUEUE_PAGE_SIZE,
  coverageValidator,
  fillStatsValidator,
  freshnessValidator,
  queueRowValidator,
  queueStatsValidator,
  queueStatusValidator,
  runKindValidator,
  runStatusValidator,
  runSummaryValidator,
} from './model/ingest';
import {
  readCoverage,
  readFillStats,
  readFreshness,
  readPaused,
  readQueueStats,
  readRecentRuns,
  writePaused,
} from './model/ops';
import { readCounter, CATALOG_COUNT_KEY } from './model/counters';

const NOT_SIGNED_IN = 'Not signed in';

async function sessionIsValid(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<boolean> {
  return await sessionLiveByHash(ctx, await sha256Hex(token));
}

const tokenArg = { token: v.string() };

type AnyReturns = Validator<any, 'required', any>;

/** Every function in this file except `signIn` is registered through one of
 * these, so the session check cannot be forgotten. Grep for `= query(`,
 * `= mutation(` and `= action(` to confirm nothing bypasses them. */
function adminQuery<
  Args extends PropertyValidators,
  Returns extends AnyReturns,
>(def: {
  args: Args;
  returns: Returns;
  handler: (ctx: QueryCtx, args: ObjectType<Args>) => Promise<Infer<Returns>>;
}) {
  return query({
    args: { ...def.args, ...tokenArg },
    returns: v.union(def.returns, v.null()),
    handler: async (ctx, args): Promise<Infer<Returns> | null> => {
      const { token, ...rest } = args as ObjectType<Args> & { token: string };
      if (!(await sessionIsValid(ctx, token))) return null;
      return await def.handler(ctx, rest as unknown as ObjectType<Args>);
    },
  });
}

function adminMutation<
  Args extends PropertyValidators,
  Returns extends AnyReturns,
>(def: {
  args: Args;
  returns: Returns;
  handler: (
    ctx: MutationCtx,
    args: ObjectType<Args>,
  ) => Promise<Infer<Returns>>;
}) {
  return mutation({
    args: { ...def.args, ...tokenArg },
    returns: def.returns,
    handler: async (ctx, args): Promise<Infer<Returns>> => {
      const { token, ...rest } = args as ObjectType<Args> & { token: string };
      if (!(await sessionIsValid(ctx, token))) throw new Error(NOT_SIGNED_IN);
      return await def.handler(ctx, rest as unknown as ObjectType<Args>);
    },
  });
}

function adminAction<
  Args extends PropertyValidators,
  Returns extends AnyReturns,
>(def: {
  args: Args;
  returns: Returns;
  handler: (ctx: ActionCtx, args: ObjectType<Args>) => Promise<Infer<Returns>>;
}) {
  return action({
    args: { ...def.args, ...tokenArg },
    returns: def.returns,
    handler: async (ctx, args): Promise<Infer<Returns>> => {
      const { token, ...rest } = args as ObjectType<Args> & { token: string };
      const live: boolean = await ctx.runQuery(internal.admin.sessionIsLive, {
        tokenHash: await sha256Hex(token),
      });
      if (!live) throw new Error(NOT_SIGNED_IN);
      return await def.handler(ctx, rest as unknown as ObjectType<Args>);
    },
  });
}

/** The action-side door onto the same check: `adminAction` has no `ctx.db`, so
 * it hashes the token itself and asks through here. */
export const sessionIsLive = internalQuery({
  args: { tokenHash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { tokenHash }) =>
    await sessionLiveByHash(ctx, tokenHash),
});

export const signInGate = internalQuery({
  args: {},
  returns: v.object({ lockedUntil: v.union(v.number(), v.null()) }),
  handler: async (ctx) => {
    const guard = await ctx.db.query('admin_signin_guard').first();
    const lockedUntil = guard?.lockedUntil ?? null;
    return {
      lockedUntil:
        lockedUntil !== null && lockedUntil > Date.now() ? lockedUntil : null,
    };
  },
});

export const recordSignInFailure = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const guard = await ctx.db.query('admin_signin_guard').first();
    if (!guard) {
      await ctx.db.insert('admin_signin_guard', {
        failures: 1,
        windowStartedAt: now,
      });
      return null;
    }
    const stale = guard.windowStartedAt <= now - SIGNIN_WINDOW_MS;
    const failures = stale ? 1 : guard.failures + 1;
    await ctx.db.patch(guard._id, {
      failures,
      windowStartedAt: stale ? now : guard.windowStartedAt,
      lockedUntil:
        failures >= SIGNIN_FAILURE_LIMIT ? now + SIGNIN_WINDOW_MS : undefined,
    });
    return null;
  },
});

export const openSession = internalMutation({
  args: { tokenHash: v.string(), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { tokenHash, expiresAt }) => {
    const now = Date.now();
    const guard = await ctx.db.query('admin_signin_guard').first();
    if (guard) {
      await ctx.db.patch(guard._id, {
        failures: 0,
        windowStartedAt: now,
        lockedUntil: undefined,
      });
    }
    const stale = await ctx.db
      .query('admin_sessions')
      .take(SESSION_SWEEP_LIMIT);
    for (const row of stale) {
      if (row.expiresAt <= now) await ctx.db.delete(row._id);
    }
    await ctx.db.insert('admin_sessions', {
      tokenHash,
      createdAt: now,
      expiresAt,
    });
    return null;
  },
});

export const signIn = action({
  args: { password: v.string() },
  returns: v.object({ token: v.string(), expiresAt: v.number() }),
  handler: async (ctx, { password }) => {
    const gate: { lockedUntil: number | null } = await ctx.runQuery(
      internal.admin.signInGate,
      {},
    );
    if (gate.lockedUntil !== null) {
      await delay(SIGNIN_FAILURE_DELAY_MS);
      throw new Error(
        'Too many failed sign-ins. The console is locked for up to an hour.',
      );
    }
    const expected = process.env.CATALOG_ADMIN_PASSWORD;
    if (!expected) {
      throw new Error('CATALOG_ADMIN_PASSWORD env var is not set');
    }
    if (!(await secretsMatch(password, expected))) {
      await delay(SIGNIN_FAILURE_DELAY_MS);
      await ctx.runMutation(internal.admin.recordSignInFailure, {});
      throw new Error('Wrong password');
    }

    const token = generateSessionToken();
    const expiresAt = Date.now() + SESSION_TTL_MS;
    await ctx.runMutation(internal.admin.openSession, {
      tokenHash: await sha256Hex(token),
      expiresAt,
    });
    return { token, expiresAt };
  },
});

export const signOutEverywhere = adminMutation({
  args: {},
  returns: v.object({ revoked: v.number(), isDone: v.boolean() }),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('admin_sessions')
      .take(SESSION_REVOKE_LIMIT + 1);
    const revoking = rows.slice(0, SESSION_REVOKE_LIMIT);
    for (const row of revoking) await ctx.db.delete(row._id);
    return {
      revoked: revoking.length,
      isDone: rows.length <= SESSION_REVOKE_LIMIT,
    };
  },
});

export const overview = adminQuery({
  args: {},
  returns: v.object({
    catalogTotal: v.number(),
    paused: v.boolean(),
    queue: queueStatsValidator,
    fill: fillStatsValidator,
    freshness: freshnessValidator,
  }),
  handler: async (ctx) => ({
    catalogTotal: await readCounter(ctx, CATALOG_COUNT_KEY),
    paused: await readPaused(ctx),
    queue: await readQueueStats(ctx),
    fill: await readFillStats(ctx),
    freshness: await readFreshness(ctx),
  }),
});

export const coverage = adminQuery({
  args: {},
  returns: coverageValidator,
  handler: async (ctx) => await readCoverage(ctx),
});

export const runs = adminQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('ingest_runs'),
      _creationTime: v.number(),
      kind: runKindValidator,
      status: runStatusValidator,
      startedAt: v.number(),
      finishedAt: v.optional(v.number()),
      summary: v.optional(runSummaryValidator),
      error: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => await readRecentRuns(ctx),
});

export const queueRows = adminQuery({
  args: {
    status: queueStatusValidator,
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    rows: v.array(queueRowValidator),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { status, cursor }) => {
    const page = await ctx.db
      .query('coop_ingest_queue')
      .withIndex('by_status', (q) => q.eq('status', status))
      .order('desc')
      .paginate({ cursor: cursor ?? null, numItems: QUEUE_PAGE_SIZE });
    return {
      rows: page.page.map((row) => ({
        _id: row._id,
        _creationTime: row._creationTime,
        ean: row.ean,
        status: row.status,
        attempts: row.attempts,
        lastError: row.lastError,
        source: row.source,
        enqueuedAt: row.enqueuedAt,
        processedAt: row.processedAt,
      })),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const startDrain = adminMutation({
  args: { batches: v.optional(v.number()) },
  returns: v.object({ batches: v.number() }),
  handler: async (ctx, { batches }) => {
    const bounded = boundedBatches(batches ?? DEFAULT_QUEUE_BATCHES);
    await ctx.scheduler.runAfter(0, internal.ingest.processQueue, {
      batches: bounded,
    });
    return { batches: bounded };
  },
});

export const startFill = adminMutation({
  args: { batches: v.optional(v.number()) },
  returns: v.object({ batches: v.number() }),
  handler: async (ctx, { batches }) => {
    const bounded = boundedBatches(batches ?? DEFAULT_FILL_BATCHES);
    await ctx.scheduler.runAfter(0, internal.ingest.fillMissing, {
      batches: bounded,
    });
    return { batches: bounded };
  },
});

function boundedBatches(batches: number): number {
  if (!Number.isFinite(batches)) return 1;
  return Math.min(Math.max(Math.floor(batches), 1), MAX_RUN_BATCHES);
}

export const setPaused = adminMutation({
  args: { paused: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { paused }) => {
    await writePaused(ctx, paused);
    return null;
  },
});

export const requeueFailed = adminAction({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ requeued: v.number() }),
  handler: async (ctx, { limit }): Promise<{ requeued: number }> =>
    await ctx.runMutation(internal.ingest.requeueFailed, { limit }),
});

export const clearDoneRows = adminAction({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { limit }): Promise<{ deleted: number }> =>
    await ctx.runMutation(internal.ingest.clearDoneRows, { limit }),
});

export const removeQueueRows = adminAction({
  args: { ean: v.string() },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { ean }): Promise<{ deleted: number }> =>
    await ctx.runMutation(internal.ingest.removeQueueRows, { ean }),
});

/** The repair for the counters the overview renders. Refuses unless ingest is
 * paused: it pages across many transactions while the live helpers keep
 * bumping, so a run against a working drain lands off by whatever moved under
 * it. A console that shows a number it cannot fix is the drift this guards. */
export const rebuildCounters = adminAction({
  args: {},
  returns: v.object({
    queue: v.union(v.record(v.string(), v.number()), v.null()),
    catalog: v.union(v.record(v.string(), v.number()), v.null()),
    pages: v.number(),
  }),
  handler: async (
    ctx,
  ): Promise<{
    queue: Record<string, number> | null;
    catalog: Record<string, number> | null;
    pages: number;
  }> => {
    const paused: boolean = await ctx.runQuery(internal.ops.isPaused, {});
    if (!paused) {
      throw new Error('Pause ingest before rebuilding the counters');
    }
    return await ctx.runAction(internal.backfill.rebuildCounters, {
      scope: 'all',
    });
  },
});

export const enqueueEans = adminAction({
  args: { eans: v.array(v.string()) },
  returns: v.object({
    queued: v.number(),
    known: v.number(),
    duplicate: v.number(),
  }),
  handler: async (ctx, { eans }) => {
    if (eans.length > ENQUEUE_PASTE_MAX) {
      throw new Error(
        `At most ${ENQUEUE_PASTE_MAX} EANs per paste, got ${eans.length}`,
      );
    }
    const totals = { queued: 0, known: 0, duplicate: 0 };
    for (let i = 0; i < eans.length; i += ENQUEUE_CHUNK) {
      const result: typeof totals = await ctx.runMutation(
        internal.ingest.enqueueEans,
        { eans: eans.slice(i, i + ENQUEUE_CHUNK), source: 'manual' },
      );
      totals.queued += result.queued;
      totals.known += result.known;
      totals.duplicate += result.duplicate;
    }
    return totals;
  },
});
