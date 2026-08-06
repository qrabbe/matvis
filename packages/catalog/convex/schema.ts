import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { coopProductInformationFields } from './schemes/coop';
import { catalogFields } from './model/fields';
import {
  queueKindValidator,
  queueStatusValidator,
  runKindValidator,
  runStatusValidator,
  runSummaryValidator,
} from './model/ingest';

export default defineSchema({
  raw_coop: defineTable({
    ...coopProductInformationFields,
    lastFetchedAt: v.optional(v.number()),
  })
    .index('by_ean', ['ean'])
    .index('by_lastFetchedAt', ['lastFetchedAt']),

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

  catalog: defineTable(catalogFields)
    .index('by_ean', ['ean'])
    .index('by_store', ['store'])
    .index('by_store_ean', ['store', 'ean'])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['store'],
    })
    .searchIndex('search_ean', { searchField: 'ean', filterFields: ['store'] }),

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
