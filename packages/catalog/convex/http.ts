import { httpRouter } from 'convex/server';
import { STORES, type CatalogItem, type StoreSlug } from '@matvis/shared';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import type { CatalogRow } from './model/catalogReads';

const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function badRequest(error: string): Response {
  return json({ error }, 400);
}

const STORE_NAMES: readonly string[] = STORES;
const STORE_LIST = STORES.join(', ');

/** Reads `store` off the URL, or reports why it can't. A helper rather than
 * two copies, since `/product` and `/search` validate it identically. */
function readStore(
  params: URLSearchParams,
): { store?: StoreSlug } | { error: string } {
  const raw = params.get('store');
  if (raw === null || raw === '') return {};
  if (!STORE_NAMES.includes(raw)) {
    return { error: `store must be one of ${STORE_LIST}, got "${raw}"` };
  }
  return { store: raw as StoreSlug };
}

// The published contract carries none of a Convex document's own fields.
function toPublished(row: CatalogRow): CatalogItem {
  const { _id, _creationTime, ...rest } = row;
  return rest;
}

const http = httpRouter();

http.route({
  path: '/product',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const params = new URL(request.url).searchParams;
    const ean = params.get('ean');
    if (!ean) return badRequest('ean is required');
    const store = readStore(params);
    if ('error' in store) return badRequest(store.error);

    const rows = await ctx.runQuery(internal.httpReads.productByEan, {
      ean,
      store: store.store,
    });
    return json(rows.map(toPublished));
  }),
});

http.route({
  path: '/search',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const params = new URL(request.url).searchParams;
    const q = params.get('q');
    if (!q) return badRequest('q is required');
    const store = readStore(params);
    if ('error' in store) return badRequest(store.error);

    const rows = await ctx.runQuery(internal.httpReads.searchTop, {
      q,
      store: store.store,
    });
    return json(rows.map(toPublished));
  }),
});

export default http;
