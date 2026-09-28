import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const targetValue = v.optional( v.union( v.null(), v.number() ) );

const targetsFields = {
	energy: targetValue,
	protein: targetValue,
	fat: targetValue,
	carbs: targetValue,
	fiber: targetValue,
	saturatedFat: targetValue,
	salt: targetValue,
};

const EMPTY_TARGETS = {
	energy: undefined,
	protein: undefined,
	fat: undefined,
	carbs: undefined,
	fiber: undefined,
	saturatedFat: undefined,
	salt: undefined,
};

/**
 * Absent for an account that has never customized a target, since the
 * default is "everything on, at the code-level default value", so there
 * is nothing to return until that changes.
 */
export const get = query( {
	args: { token: v.string() },
	returns: v.object( { targets: v.object( targetsFields ) } ),
	handler: async ( ctx, { token } ) => {
		const row = await ctx.db
			.query( 'settings' )
			.withIndex( 'by_token', ( q ) => q.eq( 'token', token ) )
			.unique();
		return { targets: row?.targets ?? EMPTY_TARGETS };
	},
} );

/**
 * Merges the given targets into whatever's already stored: a caller
 * turning off `salt` doesn't need to resend the other six untouched.
 */
export const setTargets = mutation( {
	args: { token: v.string(), targets: v.object( targetsFields ) },
	returns: v.null(),
	handler: async ( ctx, { token, targets } ) => {
		const existing = await ctx.db
			.query( 'settings' )
			.withIndex( 'by_token', ( q ) => q.eq( 'token', token ) )
			.unique();
		const merged = { ...( existing?.targets ?? {} ), ...targets };
		if ( existing ) {
			await ctx.db.patch( existing._id, { targets: merged } );
		} else {
			await ctx.db.insert( 'settings', { token, targets: merged } );
		}
		return null;
	},
} );
