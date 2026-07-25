import { STORES } from '@matvis/shared';
import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { query } from './_generated/server';
import { catalogDocValidator, storeValidator } from './model/fields';
import { readCounter, CATALOG_COUNT_KEY } from './model/counters';

/** A clean catalog row as the read API returns it: the @matvis/shared
 * `CatalogItem` contract plus Convex system fields. */
const catalogItem = catalogDocValidator;

/** Most EANs a single `getManyByEan` call may ask for. A receipt is ~20 lines,
 * so this is generous; the cap exists so one call can't turn into an unbounded
 * fan-out of index reads. */
const MAX_EANS_PER_LOOKUP = 100;

/**
 * A digit-only term this long is treated as an EAN rather than as words. Real
 * GTINs are 8, 12, 13 or 14 digits; shorter digit strings are far more likely to
 * be part of a name ("3" in "Mjölk 3%"), so they stay on the name index.
 */
const MIN_EAN_QUERY_DIGITS = 6;

function looksLikeEan(term: string): boolean {
  return new RegExp(`^\\d{${MIN_EAN_QUERY_DIGITS},}$`).test(term);
}

/**
 * Paginated clean-catalog search, the portal's list. `q` picks the index: empty
 * returns newest-first, a digit-only term runs the exact-ish `search_ean` index,
 * anything else runs the full-text `search_name` index (relevance-ordered).
 * `store` narrows any of the three to one chain.
 */
export const search = query({
  args: {
    q: v.optional(v.string()),
    store: v.optional(storeValidator),
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
  handler: async (ctx, { q, store, paginationOpts }) => {
    const term = q?.trim();
    // A search index cannot be combined with `.order()`; results come back
    // relevance-ordered, which is what we want for a query.
    if (term && looksLikeEan(term)) {
      return await ctx.db
        .query('catalog')
        .withSearchIndex('search_ean', (s) => {
          const hits = s.search('ean', term);
          return store ? hits.eq('store', store) : hits;
        })
        .paginate(paginationOpts);
    }
    if (term) {
      return await ctx.db
        .query('catalog')
        .withSearchIndex('search_name', (s) => {
          const hits = s.search('name', term);
          return store ? hits.eq('store', store) : hits;
        })
        .paginate(paginationOpts);
    }
    if (store) {
      return await ctx.db
        .query('catalog')
        .withIndex('by_store', (i) => i.eq('store', store))
        .order('desc')
        .paginate(paginationOpts);
    }
    return await ctx.db.query('catalog').order('desc').paginate(paginationOpts);
  },
});

/**
 * Every clean row for one EAN — the core lookup. Returns an ARRAY because the
 * catalog is keyed by (store, EAN): each chain keeps its own row for a shared
 * product, and which one a caller wants is the caller's decision. Empty when
 * nothing is catalogued under that EAN.
 */
export const getByEan = query({
  args: { ean: v.string() },
  returns: v.array(catalogItem),
  handler: async (ctx, { ean }) =>
    await ctx.db
      .query('catalog')
      .withIndex('by_ean', (i) => i.eq('ean', ean))
      .collect(),
});

/**
 * The same lookup for many EANs at once — what a receipt's ~20 lines need
 * without 20 round trips. Returns one flat array; a caller with several stores
 * or several EANs groups by `ean` and `store` itself. Duplicate EANs in the
 * argument are looked up once. Throws above {@link MAX_EANS_PER_LOOKUP} rather
 * than silently truncating, so a caller can't believe it got a full answer.
 */
export const getManyByEan = query({
  args: { eans: v.array(v.string()) },
  returns: v.array(catalogItem),
  handler: async (ctx, { eans }) => {
    const unique = [...new Set(eans)];
    if (unique.length > MAX_EANS_PER_LOOKUP) {
      throw new Error(
        `getManyByEan accepts at most ${MAX_EANS_PER_LOOKUP} EANs, got ${unique.length}`,
      );
    }
    const rows = await Promise.all(
      unique.map((ean) =>
        ctx.db
          .query('catalog')
          .withIndex('by_ean', (i) => i.eq('ean', ean))
          .collect(),
      ),
    );
    return rows.flat();
  },
});

/**
 * Cheap totals for the portal header, plus which chains are actually in the
 * table. The count is O(1) via the maintained counter; `stores` is one index
 * point-lookup per known slug, which keeps a store filter honest — it can offer
 * only the chains that have products rather than every reserved slug.
 */
export const stats = query({
  args: {},
  returns: v.object({ total: v.number(), stores: v.array(storeValidator) }),
  handler: async (ctx) => {
    const present = await Promise.all(
      STORES.map(async (store) => {
        const row = await ctx.db
          .query('catalog')
          .withIndex('by_store', (i) => i.eq('store', store))
          .first();
        return row ? store : null;
      }),
    );
    return {
      total: await readCounter(ctx, CATALOG_COUNT_KEY),
      stores: present.filter((store) => store !== null),
    };
  },
});
