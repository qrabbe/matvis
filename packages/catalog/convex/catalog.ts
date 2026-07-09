import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { query } from './_generated/server';
import { readCounter, CATALOG_COUNT_KEY } from './model/counters';

/** A clean catalog row as the read API returns it (matches @matvis/shared CatalogItem
 * plus Convex system fields). */
const catalogItem = v.object({
  _id: v.id('catalog'),
  _creationTime: v.number(),
  ean: v.string(),
  name: v.string(),
  store: v.string(),
  sourceTable: v.string(),
  sourceId: v.string(),
});

/**
 * Paginated clean-catalog search. Empty `q` returns newest-first. A non-empty `q`
 * runs the full-text `search_name` index (relevance-ordered). Powers the portal's
 * search box + table.
 */
export const search = query({
  args: {
    q: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(catalogItem),
    isDone: v.boolean(),
    continueCursor: v.string(),
    // `paginate()` also returns these split hints; declare them so the returns
    // validator accepts the raw result we pass through.
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(
        v.literal('SplitRecommended'),
        v.literal('SplitRequired'),
        v.null(),
      ),
    ),
  }),
  handler: async (ctx, { q, paginationOpts }) => {
    const term = q?.trim();
    if (term) {
      // A search index cannot be combined with `.order()`; results come back
      // relevance-ordered, which is what we want for a query.
      return await ctx.db
        .query('catalog')
        .withSearchIndex('search_name', (s) => s.search('name', term))
        .paginate(paginationOpts);
    }
    return await ctx.db.query('catalog').order('desc').paginate(paginationOpts);
  },
});

/** Cheap totals for the portal header. O(1) via the maintained counter. */
export const stats = query({
  args: {},
  returns: v.object({ total: v.number() }),
  handler: async (ctx) => ({
    total: await readCounter(ctx, CATALOG_COUNT_KEY),
  }),
});
