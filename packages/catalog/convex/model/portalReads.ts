import type { PaginationOptions, PaginationResult } from 'convex/server';
import type { StoreSlug } from '@matvis/shared';
import type { QueryCtx } from '../_generated/server';
import { CATEGORY_KEY_CEILING } from '../../src/category-key';
import { searchCatalog, toCatalogItem, type CatalogRow } from './catalogReads';

export type PortalListRow = {
	ean: string;
	name: string;
	brand?: string;
	packageSizeText?: string;
	imageUrl?: string;
	store: StoreSlug;
};

export type CategoryLevelRow = {
	slug: string;
	name: string;
	count: number;
	hasChildren: boolean;
};

export type CategoryNode = {
	name: string;
	count: number;
	hasChildren: boolean;
	path: string[];
	// What searchCategoryBranch takes to page through this node's products.
	categoryKey: string;
};

function toListRow( row: CatalogRow ): PortalListRow {
	const { ean, name, brand, packageSizeText, imageUrl, store } = row;
	return { ean, name, brand, packageSizeText, imageUrl, store };
}

// The catalog-portal's Coop | ICA tabs: search, and a chain's front page with
// an empty q. One store, six fields.
export async function searchForPortal(
	ctx: QueryCtx,
	args: { q?: string; store: StoreSlug; paginationOpts: PaginationOptions }
): Promise< PaginationResult< PortalListRow > > {
	const page = await searchCatalog( ctx, args );
	return { ...page, page: page.page.map( toListRow ) };
}

async function hasChildren(
	ctx: QueryCtx,
	store: StoreSlug,
	slug: string
): Promise< boolean > {
	const child = await ctx.db
		.query( 'categoryTree' )
		.withIndex( 'by_store_parent', ( q ) =>
			q.eq( 'store', store ).eq( 'parentSlug', slug )
		)
		.first();
	return child !== null;
}

// One level of the category tree: all immediate children of a parent.
// Sorted A–Ö with "Other" last, max 24 rows per spec.
export async function listCategoryLevel(
	ctx: QueryCtx,
	store: StoreSlug,
	parentSlug: string
): Promise< CategoryLevelRow[] > {
	const rows = await ctx.db
		.query( 'categoryTree' )
		.withIndex( 'by_store_parent', ( q ) =>
			q.eq( 'store', store ).eq( 'parentSlug', parentSlug )
		)
		.collect();

	const sorted = rows.sort( ( a, b ) => {
		if ( a.name === 'Other' ) {
			return 1;
		}
		if ( b.name === 'Other' ) {
			return -1;
		}
		return a.name.localeCompare( b.name, 'sv' );
	} );

	return Promise.all(
		sorted.map( async ( row ) => ( {
			slug: row.slug,
			name: row.name,
			count: row.count,
			hasChildren: await hasChildren( ctx, store, row.slug ),
		} ) )
	);
}

// One category node by its slug path, with the display names along the way
// for the path line. Returns null for an unknown path.
export async function getCategory(
	ctx: QueryCtx,
	store: StoreSlug,
	slugPath: string
): Promise< CategoryNode | null > {
	const row = await ctx.db
		.query( 'categoryTree' )
		.withIndex( 'by_store_slug', ( q ) =>
			q.eq( 'store', store ).eq( 'slug', slugPath )
		)
		.first();
	if ( ! row ) {
		return null;
	}

	const segments = slugPath ? slugPath.split( '/' ) : [];
	const path = await Promise.all(
		segments.map( async ( _, depth ) => {
			const ancestorSlug = segments.slice( 0, depth + 1 ).join( '/' );
			if ( ancestorSlug === slugPath ) {
				return row.name;
			}
			const ancestor = await ctx.db
				.query( 'categoryTree' )
				.withIndex( 'by_store_slug', ( q ) =>
					q.eq( 'store', store ).eq( 'slug', ancestorSlug )
				)
				.first();
			return ancestor?.name ?? ancestorSlug;
		} )
	);

	return {
		name: row.name,
		count: row.count,
		hasChildren: await hasChildren( ctx, store, slugPath ),
		path,
		categoryKey: row.categoryKey,
	};
}

// Products under a branch, paginated 48 at a time, in shelf order. A branch's
// categoryKey is a prefix every leaf beneath it starts with, so this is a
// range scan rather than an exact match, reaching the branch's own
// directly-tagged products and every deeper category at once.
export async function searchCategoryBranch(
	ctx: QueryCtx,
	store: StoreSlug,
	categoryKey: string,
	paginationOpts: PaginationOptions
): Promise< PaginationResult< PortalListRow > > {
	const page = await ctx.db
		.query( 'catalog' )
		.withIndex( 'by_store_key_name', ( q ) =>
			q
				.eq( 'store', store )
				.gte( 'categoryKey', categoryKey )
				.lt(
					'categoryKey',
					`${ categoryKey }${ CATEGORY_KEY_CEILING }`
				)
		)
		.paginate( paginationOpts );

	return { ...page, page: page.page.map( toCatalogItem ).map( toListRow ) };
}
