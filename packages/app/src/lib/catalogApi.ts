import type { FunctionReference } from 'convex/server';
import { anyApi } from 'convex/server';
import type { CatalogRow } from '@matvis/shared';

type CatalogGetManyByEan = FunctionReference<
  'query',
  'public',
  { eans: string[] },
  CatalogRow[]
>;

type CatalogApi = {
  catalog: {
    getManyByEan: CatalogGetManyByEan;
  };
};

export const catalogApi = anyApi as unknown as CatalogApi;
