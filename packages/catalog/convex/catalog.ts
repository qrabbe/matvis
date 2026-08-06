import { MAX_EANS_PER_LOOKUP, STORES } from '@matvis/shared';
import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { query } from './_generated/server';
import { catalogDocValidator, storeValidator } from './model/fields';
import { readCounter, CATALOG_COUNT_KEY } from './model/counters';

const catalogItem = catalogDocValidator;

const MIN_EAN_QUERY_DIGITS = 6;

function looksLikeEan(term: string): boolean {
  return new RegExp(`^\\d{${MIN_EAN_QUERY_DIGITS},}$`).test(term);
}

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

export const getByEan = query({
  args: { ean: v.string() },
  returns: v.array(catalogItem),
  handler: async (ctx, { ean }) =>
    await ctx.db
      .query('catalog')
      .withIndex('by_ean', (i) => i.eq('ean', ean))
      .take(STORES.length),
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
    const rows = await Promise.all(
      unique.map((ean) =>
        ctx.db
          .query('catalog')
          .withIndex('by_ean', (i) => i.eq('ean', ean))
          .take(STORES.length),
      ),
    );
    return rows.flat();
  },
});

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
