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
  sha256Hex,
} from './model/admin';
import {
  DEFAULT_QUEUE_BATCHES,
  DEFAULT_REFRESH_BATCHES,
  DISCOVERY_DRAIN_MAX_BATCHES,
  ENQUEUE_CHUNK,
  ENQUEUE_PASTE_MAX,
  QUEUE_PAGE_SIZE,
  freshnessStatsValidator,
  queueRowValidator,
  queueStatsValidator,
  queueStatusValidator,
  runKindValidator,
  runStatusValidator,
  runSummaryValidator,
} from './model/ingest';
import {
  readFreshnessStats,
  readPaused,
  readQueueStats,
  readRecentRuns,
  writePaused,
} from './model/ops';
import { readCounter, CATALOG_COUNT_KEY } from './model/counters';

/**
 * The admin console's entire public surface.
 *
 * `ingest.ts`, `raw.ts` and `coop/*` stay fully internal, because a public
 * ingest function on an auth-less deployment lets anyone burn Coop's API key and
 * write to the raw tables. A browser needs something public to call, so this
 * file is that something, and it is the only file a security review has to read.
 *
 * The guard is STRUCTURAL, not remembered. Every function below is defined
 * through `adminQuery` / `adminMutation` / `adminAction`, which add the `token`
 * argument and check the session BEFORE the handler runs, so there is no first
 * line anyone can forget to write. Grep this file for `= query(`, `= mutation(`
 * and `= action(`: the only bare registration is `signIn`, which is the door
 * itself and cannot check a session it is in the business of creating.
 *
 * One shared password, no user accounts. What that gives up is knowing WHO ran a
 * sweep: `ingest_runs` records what happened, not who asked for it. If a second
 * operator ever appears, the upgrade is a password provider plus an allowlist
 * table behind `sessionIsLive`, and no console component changes.
 *
 * Accepted tradeoff: the console keeps its bearer token in `localStorage`, which
 * any XSS in the portal bundle could steal. The portal renders no user-supplied
 * HTML, and expiry plus "sign out everywhere" are the only mitigations there are.
 */

// ── The gate ─────────────────────────────────────────────────────────────────

/** Thrown to a caller whose token is missing, expired or unknown. */
const NOT_SIGNED_IN = 'Not signed in';

/** Whether a raw token names a live session. The wall clock read here is
 * deliberate: expiry is checked on every call, and a live subscription that has
 * already been served keeps its answer until something writes to the table,
 * which is what "sign out everywhere" is for. */
async function sessionIsValid(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<boolean> {
  const tokenHash = await sha256Hex(token);
  const row = await ctx.db
    .query('admin_sessions')
    .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
    .first();
  return row !== null && row.expiresAt > Date.now();
}

/** Every wrapped function takes this on top of its own arguments. */
const tokenArg = { token: v.string() };

type AnyReturns = Validator<any, 'required', any>;

/**
 * A public read behind the session gate.
 *
 * Returns null rather than throwing when the token is bad, because the console
 * gates its whole signed-in view on exactly that: a `useQuery` that throws would
 * need an error boundary to tell "signed out" apart from "backend is broken",
 * and null says it in the type. Writes below throw instead, where a silent
 * no-op would be the wrong failure mode.
 */
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

/** A public write behind the session gate. */
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

/**
 * A public action behind the session gate. Most of the console's writes are
 * actions rather than mutations for a plain mechanical reason: the work they
 * delegate to lives in `internal` MUTATIONS, and a mutation cannot call another
 * mutation while an action can.
 */
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

// ── Sign-in ──────────────────────────────────────────────────────────────────

/** The session check as an action can reach it, by hash: an action has no `db`,
 * and hashing in the action means the raw token never travels further in. */
export const sessionIsLive = internalQuery({
  args: { tokenHash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { tokenHash }) => {
    const row = await ctx.db
      .query('admin_sessions')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
      .first();
    return row !== null && row.expiresAt > Date.now();
  },
});

/** Whether the door is currently locked by failed sign-ins, and until when. */
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

/**
 * Count one failed sign-in, locking the door once a window fills. Failures are
 * counted inside a rolling {@link SIGNIN_WINDOW_MS} window, so nine bad guesses
 * spread over a day never add up to a lockout.
 */
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

/**
 * Record a successful sign-in: clear the failure counter and store the token's
 * hash, sweeping a bounded slice of expired sessions on the way past.
 */
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

/**
 * Exchange the shared password for a session token. THE ONE public function in
 * this file that is not wrapped, because it is the wrapper's own precondition.
 *
 * An action because it needs three things a mutation cannot do: read a
 * deployment env var, generate real randomness (`crypto.getRandomValues` is
 * seeded inside a mutation, which would make tokens guessable), and spend wall
 * clock on a rejection. The token is returned once and never stored, only its
 * SHA-256 is.
 */
export const signIn = action({
  args: { password: v.string() },
  returns: v.object({ token: v.string(), expiresAt: v.number() }),
  handler: async (ctx, { password }) => {
    const gate: { lockedUntil: number | null } = await ctx.runQuery(
      internal.admin.signInGate,
      {},
    );
    if (gate.lockedUntil !== null) {
      // Same delay as a wrong password, so "locked" and "wrong" cannot be told
      // apart by how long they take to answer.
      await delay(SIGNIN_FAILURE_DELAY_MS);
      throw new Error(
        'Too many failed sign-ins. The console is locked for up to an hour.',
      );
    }
    // Read lazily, not at module top level: Convex imports every module at push
    // time without deployment env vars injected, so a top-level throw would fail
    // the push even with the var set.
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

/**
 * Delete every session, which signs out every browser including this one. The
 * whole revocation story, and enough for a console with one operator.
 *
 * Bounded at {@link SESSION_REVOKE_LIMIT} rather than collected, and `isDone`
 * says whether that was all of them. With one password, 12 hour expiry and a
 * sweep on every sign-in, the table holds single digits of rows, so the bound is
 * a guard rather than a page a caller is expected to walk.
 */
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

// ── See ──────────────────────────────────────────────────────────────────────

/**
 * Everything the console's header and dashboard show, in one live query: the
 * catalog total, the queue's counts, how stale the catalog is and whether ingest
 * is paused. Reactive, so a drain running in the background moves these numbers
 * on their own, which is most of what the console has over a terminal.
 *
 * Every field is a point read: the catalog total, the queue's five status counts
 * and the never-fetched total all come from maintained counters, and the stalest
 * timestamp is one row. That matters more here than anywhere else in the file,
 * because this is a LIVE query held for the length of a session — it used to
 * count by scanning, giving it a read set of most of the queue table plus the
 * head of `raw_coop`, so every row a drain touched re-ran it over ~6,000
 * documents. It was the single largest consumer of database reads on the
 * deployment. Keep it point reads.
 */
export const overview = adminQuery({
  args: {},
  returns: v.object({
    catalogTotal: v.number(),
    paused: v.boolean(),
    queue: queueStatsValidator,
    freshness: freshnessStatsValidator,
  }),
  handler: async (ctx) => ({
    catalogTotal: await readCounter(ctx, CATALOG_COUNT_KEY),
    paused: await readPaused(ctx),
    queue: await readQueueStats(ctx),
    freshness: await readFreshnessStats(ctx),
  }),
});

/**
 * The last runs, newest first. One row per action INVOCATION, so a drain that
 * schedules eight continuations reads as nine rows rather than one. A row still
 * reading `running` long after `startedAt` is an invocation that died without
 * settling.
 */
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

/** One page of queue rows in a status, newest first. The failed page with
 * `lastError` visible is the console's highest-value screen. */
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
      .withIndex('by_status_kind', (q) => q.eq('status', status))
      .order('desc')
      .paginate({ cursor: cursor ?? null, numItems: QUEUE_PAGE_SIZE });
    return {
      rows: page.page.map((row) => ({
        _id: row._id,
        _creationTime: row._creationTime,
        kind: row.kind,
        ean: row.ean,
        query: row.query,
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

// ── Run ──────────────────────────────────────────────────────────────────────

/**
 * Every run starter SCHEDULES its action and returns at once. Awaiting a drain
 * from the call a button is blocked on would hold the request open for minutes
 * and time out long before the work finished. What the run did shows up in
 * `runs` a moment later, which is what the run log is for.
 */
export const startDiscovery = adminMutation({
  args: { drain: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { drain }) => {
    await ctx.scheduler.runAfter(
      0,
      internal.coop.discovery.discoverFromSitemap,
      { drain: drain ?? true },
    );
    return null;
  },
});

/** Drain `batches` batches of the queue. Bounded by the same ceiling discovery
 * uses for its own drain, so the console cannot ask for a 100-batch run by
 * accident. */
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

/** Sweep `batches` batches of the stalest catalog rows. */
export const startRefresh = adminMutation({
  args: { batches: v.optional(v.number()) },
  returns: v.object({ batches: v.number() }),
  handler: async (ctx, { batches }) => {
    const bounded = boundedBatches(batches ?? DEFAULT_REFRESH_BATCHES);
    await ctx.scheduler.runAfter(0, internal.ingest.refreshOldest, {
      batches: bounded,
    });
    return { batches: bounded };
  },
});

/** A batch count a console is allowed to ask for: at least one, never more than
 * discovery's own drain ceiling, never a fraction. */
function boundedBatches(batches: number): number {
  if (!Number.isFinite(batches)) return 1;
  return Math.min(
    Math.max(Math.floor(batches), 1),
    DISCOVERY_DRAIN_MAX_BATCHES,
  );
}

// ── Stop ─────────────────────────────────────────────────────────────────────

/**
 * The pause switch. Checked at the top of every worker batch, which is the only
 * thing that can stop a self-scheduling chain: cancelling the schedule kills the
 * next link, and the link after it does not exist yet.
 *
 * A running drain stops within one batch. Discovery is not stopped, but the
 * drain it would have scheduled is.
 */
export const setPaused = adminMutation({
  args: { paused: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { paused }) => {
    await writePaused(ctx, paused);
    return null;
  },
});

// ── Fix ──────────────────────────────────────────────────────────────────────

// The delegating handlers below carry an explicit return type. Each is an action
// in a module whose own exports are part of the `internal` type it imports, and
// TypeScript cannot infer through that cycle without help.

/** Put failed rows back in line. Nothing retries them on its own, so this is the
 * decision that a failure was transient. */
export const requeueFailed = adminAction({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ requeued: v.number() }),
  handler: async (ctx, { limit }): Promise<{ requeued: number }> =>
    await ctx.runMutation(internal.ingest.requeueFailed, { limit }),
});

/** Delete settled `done` rows. Only `done`: a `skipped` row is the memo that
 * Coop has no such product, and deleting it invites the next discovery run to
 * re-learn the same thing. */
export const clearDoneRows = adminAction({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { limit }): Promise<{ deleted: number }> =>
    await ctx.runMutation(internal.ingest.clearDoneRows, { limit }),
});

/** Drop queue rows outright, by EAN or by search text. The way out of a row
 * nothing else can clear, such as a `skipped` EAN Coop has since started
 * stocking. */
export const removeQueueRows = adminAction({
  args: { ean: v.optional(v.string()), query: v.optional(v.string()) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { ean, query }): Promise<{ deleted: number }> =>
    await ctx.runMutation(internal.ingest.removeQueueRows, { ean, query }),
});

// ── Add ──────────────────────────────────────────────────────────────────────

/**
 * Queue a pasted list of EANs. Chunked to {@link ENQUEUE_CHUNK} per mutation
 * because enqueueing reads one full `raw_coop` document per already-known EAN,
 * and a few hundred of those is already about a megabyte of transaction reads.
 *
 * The `queued` / `known` / `duplicate` breakdown explains itself: `known` is
 * already in the catalog and belongs to the refresh sweep, `duplicate` already
 * has a queue row that has not settled.
 */
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

/** Queue one search phrase for the worker to resolve through Coop search. The
 * path for a receipt line with no GTIN. */
export const enqueueName = adminAction({
  args: { query: v.string() },
  returns: v.object({
    status: v.union(v.literal('queued'), v.literal('duplicate')),
  }),
  handler: async (
    ctx,
    { query },
  ): Promise<{ status: 'queued' | 'duplicate' }> =>
    await ctx.runMutation(internal.ingest.enqueueName, {
      query,
      source: 'manual',
    }),
});
