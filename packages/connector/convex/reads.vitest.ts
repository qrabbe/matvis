/// <reference types="vite/client" />
import { countReads, handlerOf, rangesOn } from '@matvis/shared/testing';
import type { ReadCounts } from '@matvis/shared/testing';
import type {
	DefaultFunctionArgs,
	FunctionVisibility,
	RegisteredMutation,
	RegisteredQuery,
} from 'convex/server';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import * as crons from './crons';
import * as receipts from './receipts';
import schema from './schema';
import { actingAs, TEST_SEALED_SECRET, type Test } from './testSupport';
import { MAX_RECEIPT_ITEMS, SYNC_BATCH_LIMIT } from './validators';

const modules = import.meta.glob( './**/*.ts' );

/**
 * `handlerOf` alone cannot infer `Args`/`Returns` at a call site that
 * immediately invokes its result: those two type parameters are phantom on
 * `RegisteredQuery`/`RegisteredMutation` (structurally erased), and
 * TypeScript only recovers phantom parameters from a matching generic
 * reference, which it does not do across `handlerOf`'s query-or-mutation
 * union. Naming the kind here, one branch at a time, keeps that reference
 * direct.
 */
function callQuery< Ctx, Args extends DefaultFunctionArgs, Returns >(
	fn: RegisteredQuery< FunctionVisibility, Args, Returns >,
	ctx: Ctx,
	args: Args
): Returns {
	return handlerOf< Ctx, Args, Returns >( fn )( ctx, args );
}

function callMutation< Ctx, Args extends DefaultFunctionArgs, Returns >(
	fn: RegisteredMutation< FunctionVisibility, Args, Returns >,
	ctx: Ctx,
	args: Args
): Returns {
	return handlerOf< Ctx, Args, Returns >( fn )( ctx, args );
}

async function countQuery(
	t: Test,
	read: ( ctx: QueryCtx ) => Promise< unknown >
): Promise< ReadCounts > {
	const measured = async ( ctx: QueryCtx ) => {
		const counted = countReads( ctx );
		await read( counted.ctx );
		return counted.counts;
	};
	return await t.query( measured );
}

async function countMutation(
	t: Test,
	write: ( ctx: MutationCtx ) => Promise< unknown >
): Promise< ReadCounts > {
	const measured = async ( ctx: MutationCtx ) => {
		const counted = countReads( ctx );
		await write( counted.ctx );
		return counted.counts;
	};
	return await t.mutation( measured );
}

async function seedReceipts( t: Test, receiptCount: number, items: number ) {
	return await t.run( async ( ctx ) => {
		const accountId = await ctx.db.insert( 'accounts', {
			subject: 'sub-a',
		} );
		const connectionId = await ctx.db.insert( 'connections', {
			accountId,
			store: 'coop',
			accessToken: TEST_SEALED_SECRET,
			accessTokenExpiresAt: 0,
			refreshToken: TEST_SEALED_SECRET,
			status: 'active' as const,
		} );
		let receiptId: Id< 'receipts' > | null = null;
		for ( let n = 0; n < receiptCount; n += 1 ) {
			receiptId = await ctx.db.insert( 'receipts', {
				connectionId,
				accountId,
				source: 'coop',
				externalId: `a-${ n }`,
				store: { name: 'Stora Coop' },
				currency: 'SEK',
				vat: [],
			} );
		}
		for ( let lineNo = 0; lineNo < items; lineNo += 1 ) {
			await ctx.db.insert( 'receiptItems', {
				receiptId: receiptId!,
				lineNo,
				text: `MJÖLK ${ lineNo }`,
				price: 12.5,
				isDiscount: false,
			} );
		}
		return receiptId!;
	} );
}

describe( 'receipts.list', () => {
	test( 'pages the index and never touches receiptItems', async () => {
		const t = convexTest( schema, modules );
		await seedReceipts( t, 5, 3 );

		const counts = await countQuery( actingAs( t, 'sub-a' ), ( ctx ) =>
			callQuery( receipts.list, ctx, {
				paginationOpts: { numItems: 3, cursor: null },
			} )
		);

		expect( rangesOn( counts, 'receiptItems' ) ).toEqual( [] );
		expect( counts.ranges ).toEqual( [
			{ table: 'accounts', kind: 'index', index: 'by_subject' },
			{ table: 'receipts', kind: 'index', index: 'by_account' },
		] );
		expect( counts.gets ).toBe( 0 );
		expect( counts.docs ).toBe( 1 + 3 );
	} );
} );

describe( 'receipts.getReceipt', () => {
	test( 'reads its items through by_receipt, bounded by MAX_RECEIPT_ITEMS', async () => {
		const t = convexTest( schema, modules );
		const receiptId = await seedReceipts( t, 1, MAX_RECEIPT_ITEMS + 5 );

		const counts = await countQuery( actingAs( t, 'sub-a' ), ( ctx ) =>
			callQuery( receipts.getReceipt, ctx, { receiptId } )
		);

		expect( rangesOn( counts, 'accounts' ) ).toEqual( [
			{ table: 'accounts', kind: 'index', index: 'by_subject' },
		] );
		expect( rangesOn( counts, 'receiptItems' ) ).toEqual( [
			{ table: 'receiptItems', kind: 'index', index: 'by_receipt' },
		] );
		// One itemGtinMap lookup per distinct item text — every text here is
		// unique, so this is also the item bound, from the other direction.
		expect( rangesOn( counts, 'itemGtinMap' ) ).toHaveLength(
			MAX_RECEIPT_ITEMS
		);
		expect( counts.gets ).toBe( 1 );
		expect( counts.docs ).toBe( 1 + 1 + MAX_RECEIPT_ITEMS );
	} );

	test( "loads itemGtinMap only for the receipt's own item texts, never the whole store", async () => {
		const t = convexTest( schema, modules );
		const receiptId = await seedReceipts( t, 1, 3 );

		await t.run( async ( ctx ) => {
			for ( let n = 0; n < 3; n += 1 ) {
				await ctx.db.insert( 'itemGtinMap', {
					store: 'coop',
					normalizedText: `mjölk ${ n }`,
					kind: 'product',
					gtin: `gtin-${ n }`,
					source: 'seed',
				} );
			}
			// Rows for texts this receipt never mentions — present only to
			// prove the whole store's map is never read to answer it.
			for ( let n = 0; n < 500; n += 1 ) {
				await ctx.db.insert( 'itemGtinMap', {
					store: 'coop',
					normalizedText: `unrelated product ${ n }`,
					kind: 'product',
					gtin: `unrelated-${ n }`,
					source: 'seed',
				} );
			}
		} );

		const counts = await countQuery( actingAs( t, 'sub-a' ), ( ctx ) =>
			callQuery( receipts.getReceipt, ctx, { receiptId } )
		);

		expect( rangesOn( counts, 'itemGtinMap' ) ).toHaveLength( 3 );
		expect( counts.docs ).toBe( 1 + 1 + 3 + 3 );
	} );
} );

describe( 'crons.dispatchSync', () => {
	beforeEach( () => vi.useFakeTimers() );
	afterEach( () => vi.useRealTimers() );

	async function seedConnections( t: Test, total: number, stale: number ) {
		await t.run( async ( ctx ) => {
			const accountId = await ctx.db.insert( 'accounts', {
				subject: 'sub-a',
			} );
			for ( let n = 0; n < total; n += 1 ) {
				await ctx.db.insert( 'connections', {
					accountId,
					store: 'coop',
					accessToken: TEST_SEALED_SECRET,
					accessTokenExpiresAt: 0,
					refreshToken: TEST_SEALED_SECRET,
					status: 'active' as const,
					lastSyncedAt: n < stale ? n : Date.now(),
				} );
			}
		} );
	}

	test( 'reads one batch of connections, never the whole table', async () => {
		const t = convexTest( schema, modules );
		const total = SYNC_BATCH_LIMIT + 10;
		await seedConnections( t, total, total );

		const counts = await countMutation( t, ( ctx ) =>
			callMutation( crons.dispatchSync, ctx, {} )
		);
		expect( counts.ranges ).toEqual( [
			{
				table: 'connections',
				kind: 'index',
				index: 'by_status_last_synced',
			},
		] );
		expect( counts.docs ).toBe( SYNC_BATCH_LIMIT );
		expect( counts.gets ).toBe( 0 );
	} );

	test( 'stops at the first fresh connection rather than filtering the batch', async () => {
		const t = convexTest( schema, modules );
		await seedConnections( t, SYNC_BATCH_LIMIT + 10, 2 );

		const counts = await countMutation( t, async ( ctx ) => {
			const result = await callMutation( crons.dispatchSync, ctx, {} );
			expect( result ).toEqual( {
				scheduled: 2,
				skipped: SYNC_BATCH_LIMIT - 2,
				paused: false,
			} );
			return result;
		} );
		expect( counts.ranges ).toHaveLength( 1 );
		expect( counts.docs ).toBe( SYNC_BATCH_LIMIT );
	} );
} );
