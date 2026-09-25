import type {
  FunctionReference,
  PaginationOptions,
  PaginationResult,
} from 'convex/server';
import { anyApi } from 'convex/server';
import type { CatalogRow } from '@matvis/shared';

type CatalogGetManyByEan = FunctionReference<
  'query',
  'public',
  { eans: string[] },
  CatalogRow[]
>;

type CatalogSearch = FunctionReference<
  'query',
  'public',
  { q?: string; paginationOpts: PaginationOptions },
  PaginationResult<CatalogRow>
>;

type CatalogApi = {
  catalog: {
    getManyByEan: CatalogGetManyByEan;
    search: CatalogSearch;
  };
};

export const catalogApi = anyApi as unknown as CatalogApi;
