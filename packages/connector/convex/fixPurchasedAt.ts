// One-off maintenance, run by a developer via `bunx convex run fixPurchasedAt`
// after `purchasedAtMs` was found to be off by Stockholm's UTC offset
// (1-2h) for every receipt synced before that was fixed in `../src/sync.ts` —
// existing rows keep whatever the old, offset-blind conversion produced, and
// nothing re-derives them automatically. Not scheduled and not called from
// anywhere else; the person running it decides when.
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation } from './_generated/server';
import { stockholmWallTimeToUtcMs } from '../src/coop/parse/timezone';

export const FIX_PURCHASED_AT_BATCH_SIZE = 200;

/**
 * Recomputes one bounded page of receipts. Idempotent: a receipt whose
 * stored `purchasedAtMs` already matches the recomputed value is skipped, so
 * re-running this after an interruption only ever patches what's still wrong.
 */
export const fixPurchasedAtBatch = internalMutation( {
	args: { cursor: v.union( v.string(), v.null() ) },
	returns: v.object( {
		scanned: v.number(),
		patched: v.number(),
		continueCursor: v.string(),
		isDone: v.boolean(),
	} ),
	handler: async ( ctx, { cursor } ) => {
		const result = await ctx.db
			.query( 'receipts' )
			.paginate( { cursor, numItems: FIX_PURCHASED_AT_BATCH_SIZE } );

		let patched = 0;
		for ( const receipt of result.page ) {
			if ( ! receipt.purchasedAt ) {
				continue;
			}
			const correctMs = stockholmWallTimeToUtcMs( receipt.purchasedAt );
			if ( correctMs !== receipt.purchasedAtMs ) {
				await ctx.db.patch( receipt._id, { purchasedAtMs: correctMs } );
				patched++;
			}
		}

		return {
			scanned: result.page.length,
			patched,
			continueCursor: result.continueCursor,
			isDone: result.isDone,
		};
	},
} );

export const fixPurchasedAt = internalAction( {
	args: {},
	returns: v.object( { scanned: v.number(), patched: v.number() } ),
	handler: async ( ctx ) => {
		const totals = { scanned: 0, patched: 0 };
		let cursor: string | null = null;

		for (;;) {
			const page: {
				scanned: number;
				patched: number;
				continueCursor: string;
				isDone: boolean;
			} = await ctx.runMutation(
				internal.fixPurchasedAt.fixPurchasedAtBatch,
				{
					cursor,
				}
			);
			totals.scanned += page.scanned;
			totals.patched += page.patched;

			if ( page.isDone ) {
				break;
			}
			cursor = page.continueCursor;
		}

		return totals;
	},
} );
