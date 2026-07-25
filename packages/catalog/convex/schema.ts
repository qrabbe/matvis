import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { coopProductInformationFields } from './schemes/coop';
import { catalogFields } from './model/fields';

export default defineSchema({
  // Raw Coop products, one table per chain. Shape mirrors the old repo's
  // `products` table so the 10k export imports unchanged. Future chains add
  // their own `raw_<chain>` table with a different validator.
  raw_coop: defineTable(coopProductInformationFields).index('by_ean', ['ean']),

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
