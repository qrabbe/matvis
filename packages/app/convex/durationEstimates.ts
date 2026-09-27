import { v } from 'convex/values';
import { internalMutation, query } from './_generated/server';

/**
 * Generous — this is one row per distinct product/text an account has
 * ever bought, not something that grows with day-to-day use.
 */
const MAX_ESTIMATES = 5000;

const estimateFields = {
	groupKey: v.string(),
	label: v.string(),
	daysToFinish: v.number(),
	daysOnceOpened: v.optional( v.number() ),
	maxDaysFromPurchase: v.optional( v.number() ),
	singleUse: v.optional( v.boolean() ),
	source: v.string(),
};

/**
 * One-off import from `tickets/backfill/durations.json`, run by a
 * developer via `bunx convex run durationEstimates:upsert`. Upserts by
 * `groupKey` so re-running after the review table changes updates rows in
 * place rather than duplicating them. Not reachable from the client.
 */
export const upsert = internalMutation( {
	args: { estimates: v.array( v.object( estimateFields ) ) },
	returns: v.object( { inserted: v.number(), updated: v.number() } ),
	handler: async ( ctx, { estimates } ) => {
		let inserted = 0;
		let updated = 0;
		for ( const estimate of estimates ) {
			const existing = await ctx.db
				.query( 'durationEstimates' )
				.withIndex( 'by_group_key', ( q ) =>
					q.eq( 'groupKey', estimate.groupKey )
				)
				.unique();
			if ( existing ) {
				await ctx.db.patch( existing._id, estimate );
				updated++;
			} else {
				await ctx.db.insert( 'durationEstimates', estimate );
				inserted++;
			}
		}
		return { inserted, updated };
	},
} );

const estimateRowValidator = v.object( {
	_id: v.id( 'durationEstimates' ),
	_creationTime: v.number(),
	...estimateFields,
} );

/**
 * Chain-wide reference data, not token-scoped — every account reads the
 * same ~100-row table, so the client loads it once rather than per-tile.
 */
export const list = query( {
	args: {},
	returns: v.array( estimateRowValidator ),
	handler: async ( ctx ) => {
		return await ctx.db.query( 'durationEstimates' ).take( MAX_ESTIMATES );
	},
} );
