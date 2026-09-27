import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { query } from './_generated/server';
import { storeValidator } from './model/fields';
import {
	getCategory,
	listCategoryLevel,
	searchCategoryBranch,
	searchForPortal,
} from './model/portalReads';

const portalListRow = v.object( {
	ean: v.string(),
	name: v.string(),
	brand: v.optional( v.string() ),
	packageSizeText: v.optional( v.string() ),
	imageUrl: v.optional( v.string() ),
	store: storeValidator,
} );

const portalPage = v.object( {
	page: v.array( portalListRow ),
	isDone: v.boolean(),
	continueCursor: v.string(),
	splitCursor: v.optional( v.union( v.string(), v.null() ) ),
	pageStatus: v.optional(
		v.union(
			v.literal( 'SplitRecommended' ),
			v.literal( 'SplitRequired' ),
			v.null()
		)
	),
} );

const categoryLevelRow = v.object( {
	slug: v.string(),
	name: v.string(),
	count: v.number(),
	hasChildren: v.boolean(),
} );

const categoryNode = v.object( {
	name: v.string(),
	count: v.number(),
	hasChildren: v.boolean(),
	path: v.array( v.string() ),
	categoryKey: v.string(),
} );

export const search = query( {
	args: {
		q: v.optional( v.string() ),
		store: storeValidator,
		paginationOpts: paginationOptsValidator,
	},
	returns: portalPage,
	handler: ( ctx, args ) => searchForPortal( ctx, args ),
} );

export const categoryLevel = query( {
	args: { store: storeValidator, parentSlug: v.string() },
	returns: v.array( categoryLevelRow ),
	handler: ( ctx, args ) =>
		listCategoryLevel( ctx, args.store, args.parentSlug ),
} );

export const category = query( {
	args: { store: storeValidator, slugPath: v.string() },
	returns: v.union( categoryNode, v.null() ),
	handler: ( ctx, args ) => getCategory( ctx, args.store, args.slugPath ),
} );

export const branchProducts = query( {
	args: {
		store: storeValidator,
		categoryKey: v.string(),
		paginationOpts: paginationOptsValidator,
	},
	returns: portalPage,
	handler: ( ctx, args ) =>
		searchCategoryBranch(
			ctx,
			args.store,
			args.categoryKey,
			args.paginationOpts
		),
} );
