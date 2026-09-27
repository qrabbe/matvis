import type { PaginationOptions, PaginationResult } from 'convex/server';
import type { StoreSlug } from '@matvis/shared';
import type { QueryCtx } from '../_generated/server';
import { searchCatalog, type CatalogRow } from './catalogReads';

export type PortalListRow = {
  ean: string;
  name: string;
  brand?: string;
  packageSizeText?: string;
  imageUrl?: string;
  store: StoreSlug;
};

function toListRow(row: CatalogRow): PortalListRow {
  const { ean, name, brand, packageSizeText, imageUrl, store } = row;
  return { ean, name, brand, packageSizeText, imageUrl, store };
}

// The catalog-portal's Coop | ICA tabs: search, and a chain's front page with
// an empty q. One store, six fields.
export async function searchForPortal(
  ctx: QueryCtx,
  args: { q?: string; store: StoreSlug; paginationOpts: PaginationOptions },
): Promise<PaginationResult<PortalListRow>> {
  const page = await searchCatalog(ctx, args);
  return { ...page, page: page.page.map(toListRow) };
}
