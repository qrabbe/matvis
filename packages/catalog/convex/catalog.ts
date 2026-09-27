import { MAX_EANS_PER_LOOKUP, STORES } from '@matvis/shared';
import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { query } from './_generated/server';
import { catalogDocValidator, storeValidator } from './model/fields';
import {
	readCounter,
	catalogStoreKey,
	CATALOG_COUNT_KEY,
} from './model/counters';
import { readCoverage, readFreshness } from './model/metrics';
import { rowsForEan, searchCatalog } from './model/catalogReads';

const catalogItem = catalogDocValidator;

export const search = query( {
	args: {
		q: v.optional( v.string() ),
		store: v.optional( storeValidator ),
		paginationOpts: paginationOptsValidator,
	},
	returns: v.object( {
		page: v.array( catalogItem ),
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
	} ),
	handler: ( ctx, args ) => searchCatalog( ctx, args ),
} );

export const getByEan = query( {
	args: { ean: v.string() },
	returns: v.array( catalogItem ),
	handler: async ( ctx, { ean } ) => await rowsForEan( ctx, ean ),
} );

export const getManyByEan = query( {
	args: { eans: v.array( v.string() ) },
	returns: v.array( catalogItem ),
	handler: async ( ctx, { eans } ) => {
		const unique = [ ...new Set( eans ) ];
		if ( unique.length > MAX_EANS_PER_LOOKUP ) {
			throw new Error(
				`getManyByEan accepts at most ${ MAX_EANS_PER_LOOKUP } EANs, got ${ unique.length }`
			);
		}
		const rows = await Promise.all(
			unique.map( ( ean ) => rowsForEan( ctx, ean ) )
		);
		return rows.flat();
	},
} );

/**
 * What the catalog holds and how much of it you should trust, for an audience
 * that will never see the admin console.
 *
 * **What is deliberately not here.** Queue depth, failure counts and the fill
 * cursor are operational: they say what the pipeline is doing, not what the
 * data is worth, and publishing them invites a consumer to build on the shape
 * of our backlog. They stay behind the session gate.
 *
 * **Freshness is published even though it will sometimes read badly.** Nothing
 * runs on a schedule, so `neverFetched` is most of the table and will stay that
 * way until someone runs a refresh by hand. Telling a consumer how stale the
 * data may be is both honest and the single most useful thing on this page.
 * Publishing it only while it flatters us is the one option worse than either
 * publishing it or not.
 *
 * **Store totals come from counters** rather than a `by_store` index, which is
 * what keeps `catalog` down to one plain index plus the name search. Every
 * store is returned, including the ones sitting at zero: filtering them out
 * hides that the other chains exist and are empty, which is a different claim
 * from them not existing at all.
 *
 * This is the only published read of those totals. It absorbed a `stats` query
 * that returned `total` and `stores` and nothing else, which was these same two
 * fields computed by the same code.
 */
export const health = query( {
	args: {},
	returns: v.object( {
		total: v.number(),
		stores: v.array(
			v.object( { store: storeValidator, count: v.number() } )
		),
		freshness: v.object( {
			verified: v.number(),
			neverFetched: v.number(),
			sampleSize: v.number(),
			sampleWithinMonth: v.number(),
		} ),
		coverage: v.object( {
			measuredAt: v.union( v.number(), v.null() ),
			fields: v.array(
				v.object( { field: v.string(), count: v.number() } )
			),
		} ),
	} ),
	handler: async ( ctx ) => {
		const freshness = await readFreshness( ctx );
		const coverage = await readCoverage( ctx );
		return {
			total: await readCounter( ctx, CATALOG_COUNT_KEY ),
			stores: await Promise.all(
				STORES.map( async ( store ) => ( {
					store,
					count: await readCounter( ctx, catalogStoreKey( store ) ),
				} ) )
			),
			freshness: {
				verified: freshness.verified,
				neverFetched: freshness.never,
				sampleSize: freshness.sample.size,
				sampleWithinMonth:
					freshness.sample.week + freshness.sample.month,
			},
			coverage: {
				measuredAt: coverage.measuredAt,
				fields: coverage.fields,
			},
		};
	},
} );
