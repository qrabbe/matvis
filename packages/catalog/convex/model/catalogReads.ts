import { STORES, type StoreSlug } from '@matvis/shared';
import type { PaginationOptions, PaginationResult } from 'convex/server';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';

const MIN_EAN_QUERY_DIGITS = 6;

/** Sorts above every digit, so it closes a prefix range without cutting off a
 * longer EAN that starts with the term. */
const EAN_PREFIX_CEILING = '￿';

const EAN_QUERY_PATTERN = new RegExp(`^\\d{${MIN_EAN_QUERY_DIGITS},}$`);

function looksLikeEan(term: string): boolean {
  return EAN_QUERY_PATTERN.test(term);
}

// searchText/categoryKey are internal, not in the published contract. The
// return validator rejects an undeclared field rather than stripping it, so
// every public read goes through this first.
export function toCatalogItem(
  row: Doc<'catalog'>,
): Omit<Doc<'catalog'>, 'searchText' | 'categoryKey'> {
  const { searchText, categoryKey, ...rest } = row;
  return rest;
}

export type CatalogRow = ReturnType<typeof toCatalogItem>;

/** `catalog.search` and `GET /search` both call this: one search, two
 * surfaces. The reactive query paginates it as the app scrolls; the HTTP
 * endpoint caps `paginationOpts` at 10 and reads only `page`. */
export async function searchCatalog(
  ctx: QueryCtx,
  args: {
    q?: string;
    store?: StoreSlug;
    paginationOpts: PaginationOptions;
  },
): Promise<PaginationResult<CatalogRow>> {
  const { q, store, paginationOpts } = args;
  const term = q?.trim();
  // A store filter here rides no index: `by_ean_store` is ean first, so an
  // ean range and a store equality can't share it, and the plain listing
  // below has no index on store at all. Both stay small pages, so the
  // filter runs over the fetched page in memory instead.
  const byStore = (rows: Doc<'catalog'>[]) =>
    store ? rows.filter((row) => row.store === store) : rows;

  // A prefix range beats a text index on barcodes. Exact and starts-with are
  // the only useful matches, and a search index would additionally match a
  // one digit typo onto a different real product.
  if (term && looksLikeEan(term)) {
    const page = await ctx.db
      .query('catalog')
      .withIndex('by_ean_store', (i) =>
        i.gte('ean', term).lt('ean', `${term}${EAN_PREFIX_CEILING}`),
      )
      .paginate(paginationOpts);
    return { ...page, page: byStore(page.page).map(toCatalogItem) };
  }
  if (term) {
    const page = await ctx.db
      .query('catalog')
      .withSearchIndex('search_text', (s) => {
        const matched = s.search('searchText', term);
        return store ? matched.eq('store', store) : matched;
      })
      .paginate(paginationOpts);
    return { ...page, page: page.page.map(toCatalogItem) };
  }
  const page = await ctx.db
    .query('catalog')
    .order('desc')
    .paginate(paginationOpts);
  return { ...page, page: byStore(page.page).map(toCatalogItem) };
}

/** One row per store at most, which is what bounds the take. */
export async function rowsForEan(
  ctx: QueryCtx,
  ean: string,
  store?: StoreSlug,
): Promise<CatalogRow[]> {
  const rows = await ctx.db
    .query('catalog')
    .withIndex('by_ean_store', (i) => i.eq('ean', ean))
    .take(STORES.length);
  const clean = rows.map(toCatalogItem);
  return store ? clean.filter((row) => row.store === store) : clean;
}
