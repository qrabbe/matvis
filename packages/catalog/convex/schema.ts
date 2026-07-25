import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { coopProductInformationFields } from './schemes/coop';
import { catalogFields } from './model/fields';
import { queueKindValidator, queueStatusValidator } from './model/ingest';

export default defineSchema({
  // Raw Coop products, one table per chain. Shape mirrors the old repo's
  // `products` table so the 10k export imports unchanged. Future chains add
  // their own `raw_<chain>` table with a different validator.
  //
  // `lastFetchedAt` is ours, not Coop's, which is why it sits here rather than
  // in `coopProductInformationFields` (that stays the payload shape the
  // sanitizer coerces to). It is optional because the imported snapshot predates
  // it, and `by_lastFetchedAt` reads ascending — Convex sorts a missing field
  // before any number, so the never-fetched snapshot rows come first and the
  // refresh sweep drains them before anything it has already seen.
  raw_coop: defineTable({
    ...coopProductInformationFields,
    lastFetchedAt: v.optional(v.number()),
  })
    .index('by_ean', ['ean'])
    .index('by_lastFetchedAt', ['lastFetchedAt']),

  // Coop ingest work list. Discovery drops `pending` rows in, the worker claims
  // them, fetches, writes through `raw.upsertCoopByEan` and advances the status.
  //
  // A row is either an `ean` row (fetched directly by id) or a `name` row (the
  // worker resolves the text through Coop search first, then ingests the hits).
  // Discovery is EAN-driven; the name path exists for callers that only have a
  // receipt line, and is what later populates the connector's `itemGtinMap`.
  //
  // Indexes: `by_status_kind` claims pending EAN rows before pending name rows
  // and, on its `status` prefix alone, serves the status counts and the stale
  // claim scan; `by_ean` makes "does this EAN already have a queue row" a point
  // lookup, which is what keeps a 13.5k-EAN discovery run affordable;
  // `by_kind_query` is the same dedup for name rows.
  coop_ingest_queue: defineTable({
    kind: queueKindValidator,
    ean: v.optional(v.string()), // set on ean rows, backfilled on name rows
    query: v.optional(v.string()), // search text, name rows only
    status: queueStatusValidator,
    attempts: v.number(),
    lastError: v.optional(v.string()),
    source: v.string(), // 'sitemap' | 'manual' | 'receipt_item'
    enqueuedAt: v.number(),
    claimedAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
  })
    .index('by_status_kind', ['status', 'kind'])
    .index('by_ean', ['ean'])
    .index('by_kind_query', ['kind', 'query']),

  // Clean combined catalog, one row per (store, EAN): every source keeps its own
  // row and readers dedup or prefer across stores. Columns come from
  // `model/fields`, which is the same definition the ingest and read validators
  // spread, guarded there against the shared zod contract. Built-in `_id` and
  // `_creationTime` cover the requested id + date. `sourceTable` + `sourceId`
  // point back at the raw row (id stored as a string so one column can reference
  // any `raw_*`).
  //
  // Indexes: `by_store_ean` is the write key; `by_ean` is the read path that
  // fetches every store's row for one EAN; `by_store` serves a store filter with
  // no search term, where the wanted order is newest-first rather than
  // `by_store_ean`'s by-EAN. Both search indexes filter on `store` so the portal's
  // store picker composes with either kind of query instead of silently not
  // applying to one of them.
  catalog: defineTable(catalogFields)
    .index('by_ean', ['ean'])
    .index('by_store', ['store'])
    .index('by_store_ean', ['store', 'ean'])
    .searchIndex('search_name', {
      searchField: 'name',
      filterFields: ['store'],
    })
    .searchIndex('search_ean', { searchField: 'ean', filterFields: ['store'] }),

  // Maintained O(1) counters (e.g. clean-catalog row count) keyed by name.
  app_counters: defineTable({
    key: v.string(),
    value: v.number(),
  }).index('by_key', ['key']),
});
