import type {
  FunctionReference,
  PaginationOptions,
  PaginationResult,
} from 'convex/server';
import { anyApi } from 'convex/server';
import type { CatalogRow, StoreSlug } from '@matvis/shared';

type CatalogSearch = FunctionReference<
  'query',
  'public',
  { q?: string; store?: StoreSlug; paginationOpts: PaginationOptions },
  PaginationResult<CatalogRow>
>;

type CatalogGetByEan = FunctionReference<
  'query',
  'public',
  { ean: string },
  CatalogRow[]
>;

type CatalogGetManyByEan = FunctionReference<
  'query',
  'public',
  { eans: string[] },
  CatalogRow[]
>;

type CatalogStats = FunctionReference<
  'query',
  'public',
  {},
  { total: number; stores: StoreSlug[] }
>;

type CatalogApi = {
  catalog: {
    search: CatalogSearch;
    getByEan: CatalogGetByEan;
    getManyByEan: CatalogGetManyByEan;
    stats: CatalogStats;
  };
};

export const api = anyApi as unknown as CatalogApi;
