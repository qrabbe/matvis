import type { FunctionReference } from 'convex/server';
import { anyApi } from 'convex/server';
import type { CatalogRow } from '@matvis/shared';

// ── Typed facade over the catalog's public READ API ──────────────────────────
// The catalog is a SECOND Convex deployment (see lib/catalogClient.ts for why it
// is not the ambient one). Same `anyApi` technique and same rationale as
// lib/convexApi.ts; the row shape comes from @matvis/shared's `CatalogRow`.
//
// QUERIES ONLY. That costs nothing to promise here: the catalog's entire public
// surface is four queries plus a password-gated admin sign-in — every function
// in `ingest.ts`, `raw.ts`, `ops.ts` and `backfill.ts` is `internal*`, so there
// is no public write to reach even with a hand-built reference.

/** Every store's row for each of many EANs at once, flat — the catalog is keyed
 * by (store, EAN) and the caller picks. Capped server side, see
 * {@link MAX_EANS_PER_LOOKUP}. */
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

/**
 * Most EANs one `getManyByEan` call may ask for. The server throws above its own
 * cap rather than truncating, so a caller that guesses high gets an error, not a
 * short answer. Mirrors `MAX_EANS_PER_LOOKUP` in packages/catalog/convex/catalog.ts
 * — keep the two in step.
 */
export const MAX_EANS_PER_LOOKUP = 50;

/** The catalog's public read API, statically typed, backed by the runtime proxy. */
export const catalogApi = anyApi as unknown as CatalogApi;
