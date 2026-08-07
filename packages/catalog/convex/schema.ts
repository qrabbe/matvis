import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { coopProductInformationFields } from './schemes/coop';
import { catalogFields, storeValidator } from './model/fields';
import {
  queueKindValidator,
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
  }).index('by_store_ean', ['store', 'ean']),

  coop_ingest_queue: defineTable({
    kind: queueKindValidator,
    ean: v.optional(v.string()),
    query: v.optional(v.string()),
    status: queueStatusValidator,
    attempts: v.number(),
    lastError: v.optional(v.string()),
    source: v.string(),
    enqueuedAt: v.number(),
    claimedAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
  })
    .index('by_status_kind', ['status', 'kind'])
    .index('by_ean', ['ean'])
    .index('by_kind_query', ['kind', 'query']),

  /** Two indexes on purpose. `by_ean_store` is ean first so it serves both an
   * ean only lookup and the exact per store upsert, and EAN search is a range
   * scan over it rather than a second text index. Per store totals come from
   * `app_counters`, which is what retires `by_store`. Filtering the catalog by
   * store is gone from the API, so the name search carries no filter field. */
  catalog: defineTable(catalogFields)
    .index('by_ean_store', ['ean', 'store'])
    .searchIndex('search_name', { searchField: 'name' }),

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

  ingest_settings: defineTable({
    paused: v.boolean(),
    updatedAt: v.number(),
    fillCursor: v.optional(v.string()),
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
