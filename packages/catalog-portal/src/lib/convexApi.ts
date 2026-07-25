import type {
  FunctionReference,
  PaginationOptions,
  PaginationResult,
} from 'convex/server';
import { anyApi } from 'convex/server';
import type { GenericId } from 'convex/values';
import type { CatalogItem, StoreSlug } from '@matvis/shared';

// ── Typed facade over the catalog's public Convex API ────────────────────────
// The portal is a separate package from @matvis/catalog, where the Convex
// backend and its `convex dev`-generated `_generated/api` live. Importing that
// generated `api` directly would drag the whole convex/ program into THIS
// package's typecheck under its stricter tsconfig. Instead we call the
// deployment through Convex's runtime `anyApi` proxy (it builds valid path-based
// function references — `anyApi.catalog.search` then "catalog:search") and layer
// static types on top. The row shape is derived from @matvis/shared's
// `CatalogItem` (the SAME source of truth the server's validator mirrors), so
// the UI can't drift on the contract.

/** A stored clean-catalog row as the read API returns it. */
export type CatalogRow = CatalogItem & {
  _id: GenericId<'catalog'>;
  _creationTime: number;
};

type CatalogSearch = FunctionReference<
  'query',
  'public',
  { q?: string; store?: StoreSlug; paginationOpts: PaginationOptions },
  PaginationResult<CatalogRow>
>;

/** Every store's row for one EAN — an array, since the catalog is keyed by
 * (store, EAN) and the caller picks. */
type CatalogGetByEan = FunctionReference<
  'query',
  'public',
  { ean: string },
  CatalogRow[]
>;

/** The same lookup for a whole receipt's worth of EANs, flat. */
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

/** The catalog's public API, statically typed, backed by the runtime proxy. */
export const api = anyApi as unknown as CatalogApi;
