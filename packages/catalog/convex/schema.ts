import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { catalogFields, storeValidator } from './model/fields';
import {
  queueStatusValidator,
  runKindValidator,
  runStatusValidator,
  runSummaryValidator,
} from './model/ingest';

export default defineSchema({
  /** Every barcode we have ever heard of, per store. Deliberately dumb: it is
   * the target set, `catalog` is the achieved set, and the difference is the
   * work the fill sweep has left to do. */
  eans: defineTable({
    ean: v.string(),
    store: storeValidator,
    addedAt: v.number(),

    /** The store's own product id, where an EAN alone cannot address the
     * source. ICA publishes no by EAN lookup and keys everything on a 7 digit
     * page id, so without this an ICA barcode has no way back to the page it
     * came from. Coop resolves by EAN and leaves it absent. */
    sourceId: v.optional(v.string()),
  }).index('by_store_ean', ['store', 'ean']),

  /** One row per EAN waiting to be fetched, for every store rather than only
   * Coop. `by_store_status` drives the claim, because the chains cannot share
   * a drain: Coop resolves ~500 EANs in one request and ICA is one page per
   * product. `by_store_ean` answers "is this already queued".
   *
   * The status counters stay whole-table rather than per store. Claiming has
   * to be per store, counting does not, and splitting the keys would rewrite
   * every console read for a number nobody has asked for yet. */
  ingest_queue: defineTable({
    ean: v.string(),
    store: storeValidator,
    sourceId: v.optional(v.string()),
    status: queueStatusValidator,
    attempts: v.number(),
    lastError: v.optional(v.string()),
    source: v.string(),
    enqueuedAt: v.number(),
    claimedAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
  })
    .index('by_store_status', ['store', 'status'])
    .index('by_store_ean', ['store', 'ean']),

  /** Two indexes on purpose. `by_ean_store` is ean first so it serves both an
   * ean only lookup and the exact per store upsert, and EAN search is a range
   * scan over it rather than a second text index. Per store totals come from
   * `app_counters`, which is what retires `by_store`. Filtering the catalog by
   * store is gone from the API, so the name search carries no filter field. */
  catalog: defineTable(catalogFields)
    .index('by_ean_store', ['ean', 'store'])
    .searchIndex('search_name', { searchField: 'name' }),

  /** One row per settled search term. `visitor` is a random id the browser
   * makes up, not a signed-in identity: the catalog site has no sign-in and
   * this row cannot name a person. Nothing else about the request is recorded.
   *
   * No `at` field and no index, on purpose. `_creationTime` is the date, and
   * the only read is a bounded newest-first page, exactly as `ingest_runs` is
   * served. A `by_term` index is what to reach for when the tally outgrows a
   * sample, and that is a different step. */
  search_events: defineTable({
    term: v.string(),
    visitor: v.string(),
    results: v.number(),
  }),

  app_counters: defineTable({
    key: v.string(),
    value: v.number(),
  }).index('by_key', ['key']),

  ingest_runs: defineTable({
    kind: runKindValidator,
    status: runStatusValidator,
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    summary: v.optional(runSummaryValidator),
    error: v.optional(v.string()),
  }),

  /** `fillCursors` is keyed by store slug. An absent entry means that store's
   * sweep is at the start of a fresh pass, which is also where it lands after
   * wrapping, so the worklist cycles per chain rather than globally.
   *
   * The key is `v.string()` and not `storeValidator` because the map really is
   * partial, and a record over a union of literals types as a total one. Only
   * `writeFillCursor` writes here and it takes a `StoreSlug`. */
  ingest_settings: defineTable({
    paused: v.boolean(),
    updatedAt: v.number(),
    fillCursors: v.optional(v.record(v.string(), v.string())),
  }),

  admin_sessions: defineTable({
    tokenHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index('by_tokenHash', ['tokenHash']),

  admin_signin_guard: defineTable({
    failures: v.number(),
    windowStartedAt: v.number(),
    lockedUntil: v.optional(v.number()),
  }),
});
