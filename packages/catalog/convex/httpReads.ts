import { v } from 'convex/values';
import { internalQuery } from './_generated/server';
import { catalogDocValidator, storeValidator } from './model/fields';
import { rowsForEan, searchCatalog } from './model/catalogReads';

const HTTP_SEARCH_LIMIT = 10;

export const productByEan = internalQuery( {
	args: { ean: v.string(), store: v.optional( storeValidator ) },
	returns: v.array( catalogDocValidator ),
	handler: ( ctx, { ean, store } ) => rowsForEan( ctx, ean, store ),
} );

export const searchTop = internalQuery( {
	args: { q: v.optional( v.string() ), store: v.optional( storeValidator ) },
	returns: v.array( catalogDocValidator ),
	handler: async ( ctx, { q, store } ) => {
		const result = await searchCatalog( ctx, {
			q,
			store,
			paginationOpts: { numItems: HTTP_SEARCH_LIMIT, cursor: null },
		} );
		return result.page;
	},
} );
