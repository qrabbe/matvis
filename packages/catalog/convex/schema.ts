import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { coopProductInformationFields } from './schemes/coop';

export default defineSchema({
  // Raw Coop products, one table per chain. Shape mirrors the old repo's
  // `products` table so the 10k export imports unchanged. Future chains add
  // their own `raw_<chain>` table with a different validator.
  raw_coop: defineTable(coopProductInformationFields).index('by_ean', ['ean']),

  // Clean combined catalog, one row per (store, EAN): every source keeps its own
  // row and readers dedup or prefer across stores. Built-in `_id` and
  // `_creationTime` cover the requested id + date. `sourceTable` + `sourceId`
  // point back at the raw row (id stored as a string so one column can reference
  // any `raw_*`). `by_store_ean` is the write key; `by_ean` stays as the
  // read-side path that fetches every store's row for one EAN.
  catalog: defineTable({
    ean: v.string(),
    name: v.string(),
    store: v.string(),
    sourceTable: v.string(),
    sourceId: v.string(),
  })
    .index('by_ean', ['ean'])
    .index('by_store_ean', ['store', 'ean'])
    .searchIndex('search_name', { searchField: 'name' })
    .searchIndex('search_ean', { searchField: 'ean' }),

  // Maintained O(1) counters (e.g. clean-catalog row count) keyed by name.
  app_counters: defineTable({
    key: v.string(),
    value: v.number(),
  }).index('by_key', ['key']),
});
