import { MAX_EANS_PER_LOOKUP, STORES } from '@matvis/shared';
import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { query, type QueryCtx } from './_generated/server';
import { catalogDocValidator, storeValidator } from './model/fields';
import {
  readCounter,
  catalogStoreKey,
  CATALOG_COUNT_KEY,
} from './model/counters';

const catalogItem = catalogDocValidator;

const MIN_EAN_QUERY_DIGITS = 6;

/** Sorts above every digit, so it closes a prefix range without cutting off a
 * longer EAN that starts with the term. */
const EAN_PREFIX_CEILING = '￿';

function looksLikeEan(term: string): boolean {
  return new RegExp(`^\\d{${MIN_EAN_QUERY_DIGITS},}$`).test(term);
}

export const search = query({
  args: {
    q: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(catalogItem),
    isDone: v.boolean(),
    continueCursor: v.string(),
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
    // A prefix range beats a text index on barcodes. Exact and starts-with are
    // the only useful matches, and a search index would additionally match a
    // one digit typo onto a different real product.
    if (term && looksLikeEan(term)) {
      return await ctx.db
        .query('catalog')
        .withIndex('by_ean_store', (i) =>
          i.gte('ean', term).lt('ean', `${term}${EAN_PREFIX_CEILING}`),
        )
        .paginate(paginationOpts);
    }
    if (term) {
      return await ctx.db
        .query('catalog')
        .withSearchIndex('search_name', (s) => s.search('name', term))
        .paginate(paginationOpts);
    }
    return await ctx.db.query('catalog').order('desc').paginate(paginationOpts);
  },
});

/** One row per store at most, which is what bounds the take. */
function rowsForEan(ctx: QueryCtx, ean: string) {
  return ctx.db
    .query('catalog')
    .withIndex('by_ean_store', (i) => i.eq('ean', ean))
    .take(STORES.length);
}

export const getByEan = query({
  args: { ean: v.string() },
  returns: v.array(catalogItem),
  handler: async (ctx, { ean }) => await rowsForEan(ctx, ean),
});

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
    const rows = await Promise.all(unique.map((ean) => rowsForEan(ctx, ean)));
    return rows.flat();
  },
});

/** Store totals come from counters rather than a `by_store` index, which is
 * what keeps `catalog` down to one plain index plus the name search.
 *
 * Every store is returned, including the ones sitting at zero. Filtering them
 * out hides that the other chains exist and are empty, which is a different
 * claim from them not existing at all, and store coverage is the first thing a
 * consumer wants to know. */
export const stats = query({
  args: {},
  returns: v.object({
    total: v.number(),
    stores: v.array(v.object({ store: storeValidator, count: v.number() })),
  }),
  handler: async (ctx) => ({
    total: await readCounter(ctx, CATALOG_COUNT_KEY),
    stores: await Promise.all(
      STORES.map(async (store) => ({
        store,
        count: await readCounter(ctx, catalogStoreKey(store)),
      })),
    ),
  }),
});
