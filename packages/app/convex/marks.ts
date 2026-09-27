import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { mutation, query, type MutationCtx } from './_generated/server';

const MAX_BATCH_MARKS = 500;

function assertValidFinishedAt( finishedAt: number ): void {
	if (
		! Number.isFinite( finishedAt ) ||
		finishedAt > Date.now() + 86_400_000
	) {
		throw new Error( 'finishedAt must not be far in the future' );
	}
}

function assertValidStartedAt(
	startedAt: number | undefined,
	finishedAt: number
): void {
	if ( startedAt === undefined ) {
		return;
	}
	if ( ! Number.isFinite( startedAt ) || startedAt > finishedAt ) {
		throw new Error(
			'startedAt must be a finite date at or before finishedAt'
		);
	}
}

function assertValidUnit( lineNo: number, unitIndex: number ): void {
	if ( ! Number.isInteger( lineNo ) || lineNo < 0 ) {
		throw new Error( 'lineNo must be a non-negative integer' );
	}
	if ( ! Number.isInteger( unitIndex ) || unitIndex < 0 ) {
		throw new Error( 'unitIndex must be a non-negative integer' );
	}
}

const unitFields = {
	receiptId: v.string(),
	lineNo: v.number(),
	unitIndex: v.number(),
};

const markFields = {
	...unitFields,
	outcome: v.union( v.literal( 'finished' ), v.literal( 'wasted' ) ),
	finishedAt: v.number(),
	finishedAtHandSet: v.boolean(),
	startedAt: v.optional( v.number() ),
	via: v.union(
		v.literal( 'tap' ),
		v.literal( 'trip' ),
		v.literal( 'details' ),
		v.literal( 'backfill' )
	),
	source: v.optional(
		v.union( v.literal( 'user' ), v.literal( 'backfill' ) )
	),
};

async function findMark(
	ctx: MutationCtx,
	token: string,
	receiptId: string,
	lineNo: number,
	unitIndex: number
): Promise< Doc< 'marks' > | null > {
	return await ctx.db
		.query( 'marks' )
		.withIndex( 'by_token_unit', ( q ) =>
			q
				.eq( 'token', token )
				.eq( 'receiptId', receiptId )
				.eq( 'lineNo', lineNo )
				.eq( 'unitIndex', unitIndex )
		)
		.unique();
}

/**
 * Sets one unit's outcome — a tap, a trip catch-up, or an edit made from
 * Details. Upserts: calling it again on the same unit (e.g. correcting a
 * date from Details) replaces the existing mark rather than stacking a
 * second one, since a unit can only be in one state at a time.
 */
export const mark = mutation( {
	args: { token: v.string(), ...markFields },
	returns: v.id( 'marks' ),
	handler: async ( ctx, { token, ...fields } ) => {
		assertValidUnit( fields.lineNo, fields.unitIndex );
		assertValidFinishedAt( fields.finishedAt );
		assertValidStartedAt( fields.startedAt, fields.finishedAt );

		const existing = await findMark(
			ctx,
			token,
			fields.receiptId,
			fields.lineNo,
			fields.unitIndex
		);
		if ( existing ) {
			await ctx.db.patch( existing._id, fields );
			return existing._id;
		}
		return await ctx.db.insert( 'marks', { token, ...fields } );
	},
} );

/**
 * The same as {@link mark}, applied to several units at once with one
 * shared date — "Mark all N finished" on a trip. `finishedAtHandSet` still
 * applies to the whole batch: false unless the person changed the date away
 * from "today" in the toast, matching a single tap's own rule.
 */
export const markMany = mutation( {
	args: {
		token: v.string(),
		units: v.array( v.object( unitFields ) ),
		outcome: v.union( v.literal( 'finished' ), v.literal( 'wasted' ) ),
		finishedAt: v.number(),
		finishedAtHandSet: v.boolean(),
		via: v.union(
			v.literal( 'tap' ),
			v.literal( 'trip' ),
			v.literal( 'details' ),
			v.literal( 'backfill' )
		),
		source: v.optional(
			v.union( v.literal( 'user' ), v.literal( 'backfill' ) )
		),
	},
	returns: v.array( v.id( 'marks' ) ),
	handler: async ( ctx, { token, units, ...shared } ) => {
		if ( units.length > MAX_BATCH_MARKS ) {
			throw new Error(
				`cannot mark more than ${ MAX_BATCH_MARKS } units at once`
			);
		}
		assertValidFinishedAt( shared.finishedAt );
		for ( const unit of units ) {
			assertValidUnit( unit.lineNo, unit.unitIndex );
		}

		const ids: Doc< 'marks' >[ '_id' ][] = [];
		for ( const unit of units ) {
			const existing = await findMark(
				ctx,
				token,
				unit.receiptId,
				unit.lineNo,
				unit.unitIndex
			);
			const fields = { ...unit, ...shared, startedAt: undefined };
			if ( existing ) {
				await ctx.db.patch( existing._id, fields );
				ids.push( existing._id );
			} else {
				ids.push(
					await ctx.db.insert( 'marks', { token, ...fields } )
				);
			}
		}
		return ids;
	},
} );

/**
 * "Put back in the pantry" — undoes a finish or a throw-away. Silently
 * does nothing for a unit that was never marked, the same way deleting an
 * already-gone row elsewhere in this app is a no-op rather than an error.
 */
export const unmark = mutation( {
	args: { token: v.string(), ...unitFields },
	returns: v.null(),
	handler: async ( ctx, { token, receiptId, lineNo, unitIndex } ) => {
		const existing = await findMark(
			ctx,
			token,
			receiptId,
			lineNo,
			unitIndex
		);
		if ( existing ) {
			await ctx.db.delete( existing._id );
		}
		return null;
	},
} );

const markRowValidator = v.object( {
	_id: v.id( 'marks' ),
	_creationTime: v.number(),
	...markFields,
} );

export const list = query( {
	args: { token: v.string() },
	returns: v.array( markRowValidator ),
	handler: async ( ctx, { token } ) => {
		const rows = await ctx.db
			.query( 'marks' )
			.withIndex( 'by_token', ( q ) => q.eq( 'token', token ) )
			.collect();
		return rows.map( ( { token: _token, ...row } ) => row );
	},
} );

export const exportAll = query( {
	args: { token: v.string() },
	returns: v.object( { marks: v.array( markRowValidator ) } ),
	handler: async ( ctx, { token } ) => {
		const rows = await ctx.db
			.query( 'marks' )
			.withIndex( 'by_token', ( q ) => q.eq( 'token', token ) )
			.collect();
		return { marks: rows.map( ( { token: _token, ...row } ) => row ) };
	},
} );
