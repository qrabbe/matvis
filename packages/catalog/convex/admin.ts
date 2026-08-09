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
import { storeValidator } from './model/fields';
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
  runPointValidator,
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
  readRunHistory,
  writePaused,
} from './model/ops';
import { readCounter, CATALOG_COUNT_KEY } from './model/counters';
import { SEARCH_STATS_SAMPLE, tallySearchEvents } from './model/search';

const NOT_SIGNED_IN = 'Not signed in';

/** Which lane an admin call means when it names no store. Coop is the only
 * chain the console was built around and the only one with history, so leaving
 * it implicit keeps every existing caller working while the argument opens the
 * surface to the rest. */
const DEFAULT_LANE = 'coop' as const;

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

/** `store` selects which lane's fill progress is reported. Everything else on
 * this panel is whole-catalog, including the queue counts, so the argument is
 * optional and the busiest lane is the default. */
export const overview = adminQuery({
  args: { store: v.optional(storeValidator) },
  returns: v.object({
    catalogTotal: v.number(),
    paused: v.boolean(),
    queue: queueStatsValidator,
    fill: fillStatsValidator,
    freshness: freshnessValidator,
  }),
  handler: async (ctx, { store }) => ({
    catalogTotal: await readCounter(ctx, CATALOG_COUNT_KEY),
    paused: await readPaused(ctx),
    queue: await readQueueStats(ctx),
    fill: await readFillStats(ctx, store ?? DEFAULT_LANE),
    freshness: await readFreshness(ctx),
  }),
});

/** Read-only. Nothing in this panel writes.
 *
 * A sample rather than an all-time rollup, and `oldestAt` is what keeps that
 * honest: the console states the window next to the numbers, because a number
 * without its window is a number that gets misremembered as all-time. */
export const searchStats = adminQuery({
  args: {},
  returns: v.object({
    sampled: v.number(),
    visitors: v.number(),
    zeroResults: v.number(),
    oldestAt: v.union(v.number(), v.null()),
    top: v.array(
      v.object({
        term: v.string(),
        count: v.number(),
        zeroResults: v.number(),
        lastAt: v.number(),
      }),
    ),
    recent: v.array(
      v.object({
        term: v.string(),
        at: v.number(),
        visitor: v.string(),
        results: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('search_events')
      .order('desc')
      .take(SEARCH_STATS_SAMPLE);
    return tallySearchEvents(
      rows.map((row) => ({
        term: row.term,
        visitor: row.visitor,
        results: row.results,
        at: row._creationTime,
      })),
    );
  },
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

/** The trend behind the run log: what each drain actually added, oldest first.
 * Answers "is it still finding anything", which the newest-20 log cannot. */
export const runHistory = adminQuery({
  args: {},
  returns: v.array(runPointValidator),
  handler: async (ctx) => await readRunHistory(ctx),
});

export const queueRows = adminQuery({
  args: {
    status: queueStatusValidator,
    store: v.optional(storeValidator),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    rows: v.array(queueRowValidator),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { status, store, cursor }) => {
    const page = await ctx.db
      .query('ingest_queue')
      .withIndex('by_store_status', (q) =>
        q.eq('store', store ?? DEFAULT_LANE).eq('status', status),
      )
      .order('desc')
      .paginate({ cursor: cursor ?? null, numItems: QUEUE_PAGE_SIZE });
    return {
      rows: page.page.map((row) => ({
        _id: row._id,
        _creationTime: row._creationTime,
        ean: row.ean,
        store: row.store,
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
  args: { store: v.optional(storeValidator), batches: v.optional(v.number()) },
  returns: v.object({ batches: v.number() }),
  handler: async (ctx, { store, batches }) => {
    const bounded = boundedBatches(batches ?? DEFAULT_QUEUE_BATCHES);
    await ctx.scheduler.runAfter(0, internal.ingest.processQueue, {
      store: store ?? DEFAULT_LANE,
      batches: bounded,
    });
    return { batches: bounded };
  },
});

export const startFill = adminMutation({
  args: { store: v.optional(storeValidator), batches: v.optional(v.number()) },
  returns: v.object({ batches: v.number() }),
  handler: async (ctx, { store, batches }) => {
    const bounded = boundedBatches(batches ?? DEFAULT_FILL_BATCHES);
    await ctx.scheduler.runAfter(0, internal.ingest.fillMissing, {
      store: store ?? DEFAULT_LANE,
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
  args: { store: v.optional(storeValidator), limit: v.optional(v.number()) },
  returns: v.object({ requeued: v.number() }),
  handler: async (ctx, { store, limit }): Promise<{ requeued: number }> =>
    await ctx.runMutation(internal.ingest.requeueFailed, {
      store: store ?? DEFAULT_LANE,
      limit,
    }),
});

export const clearDoneRows = adminAction({
  args: { store: v.optional(storeValidator), limit: v.optional(v.number()) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { store, limit }): Promise<{ deleted: number }> =>
    await ctx.runMutation(internal.ingest.clearDoneRows, {
      store: store ?? DEFAULT_LANE,
      limit,
    }),
});

export const removeQueueRows = adminAction({
  args: { store: v.optional(storeValidator), ean: v.string() },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { store, ean }): Promise<{ deleted: number }> =>
    await ctx.runMutation(internal.ingest.removeQueueRows, {
      store: store ?? DEFAULT_LANE,
      ean,
    }),
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

/** One or many EANs into one store's lane. `eans` is the console paste and
 * `rows` is the loader's form, which additionally carries the store's own
 * product id where an EAN cannot address the source on its own.
 *
 * Enqueuing is all this does. The barcodes land in `eans` and, where the
 * catalog has no row for them yet, in the queue. Turning them into products is
 * the drain, either from the console or scheduled here by the fill sweep. */
export const enqueueEans = adminAction({
  args: {
    store: v.optional(storeValidator),
    eans: v.optional(v.array(v.string())),
    rows: v.optional(
      v.array(v.object({ ean: v.string(), sourceId: v.optional(v.string()) })),
    ),
  },
  returns: v.object({
    queued: v.number(),
    known: v.number(),
    duplicate: v.number(),
  }),
  handler: async (ctx, { store, eans, rows }) => {
    const all = rows ?? (eans ?? []).map((ean) => ({ ean }));
    if (all.length > ENQUEUE_PASTE_MAX) {
      throw new Error(
        `At most ${ENQUEUE_PASTE_MAX} EANs per paste, got ${all.length}`,
      );
    }
    const totals = { queued: 0, known: 0, duplicate: 0 };
    for (let i = 0; i < all.length; i += ENQUEUE_CHUNK) {
      const result: typeof totals = await ctx.runMutation(
        internal.ingest.enqueueEans,
        {
          store: store ?? DEFAULT_LANE,
          rows: all.slice(i, i + ENQUEUE_CHUNK),
          source: 'manual',
        },
      );
      totals.queued += result.queued;
      totals.known += result.known;
      totals.duplicate += result.duplicate;
    }
    return totals;
  },
});

/** The door for replaying legacy size fields out of a pre-migration snapshot.
 * One-off repair work rather than a console button, so it lives here only
 * because the snapshot is on someone's laptop and an internal mutation cannot
 * be reached from there. See ../MIGRATION-canonical-units.md. */
export const repairNetContent = adminAction({
  args: {
    rows: v.array(
      v.object({
        ean: v.string(),
        store: storeValidator,
        packageSize: v.optional(v.number()),
        packageSizeUnit: v.optional(v.string()),
        salesUnit: v.optional(v.string()),
      }),
    ),
  },
  returns: v.object({
    patched: v.number(),
    skipped: v.number(),
    stillUnresolved: v.number(),
    absent: v.number(),
  }),
  handler: async (ctx, { rows }) => {
    if (rows.length > ENQUEUE_PASTE_MAX) {
      throw new Error(
        `At most ${ENQUEUE_PASTE_MAX} rows per call, got ${rows.length}`,
      );
    }
    const totals = {
      patched: 0,
      skipped: 0,
      stillUnresolved: 0,
      absent: 0,
    };
    for (let i = 0; i < rows.length; i += ENQUEUE_CHUNK) {
      const result: typeof totals = await ctx.runMutation(
        internal.backfill.repairNetContent,
        { rows: rows.slice(i, i + ENQUEUE_CHUNK) },
      );
      totals.patched += result.patched;
      totals.skipped += result.skipped;
      totals.stillUnresolved += result.stillUnresolved;
      totals.absent += result.absent;
    }
    return totals;
  },
});
