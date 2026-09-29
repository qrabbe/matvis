/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { actingAs, TEST_SEALED_SECRET, type Test } from './testSupport';

const modules = import.meta.glob( './**/*.ts' );

async function seedAccount( t: Test ) {
	return await t.run( async ( ctx ) => {
		const accountId = await ctx.db.insert( 'accounts', {
			subject: 'sub-a',
			token: 'tok-a',
		} );
		return accountId;
	} );
}

describe( 'mappings.link', () => {
	test( 'writes a product row a receipt can then resolve against', async () => {
		const t = convexTest( schema, modules );
		await seedAccount( t );
		await actingAs( t, 'sub-a' ).mutation( api.mappings.link, {
			token: 'tok-a',
			store: 'coop',
			text: 'VANILJYOGHURT 2,7% 35,50',
			kind: 'product',
			gtin: '7310865004703',
			price: 35.5,
		} );

		const rows = await t.run( async ( ctx ) =>
			ctx.db.query( 'itemGtinMap' ).collect()
		);
		expect( rows ).toHaveLength( 1 );
		expect( rows[ 0 ] ).toMatchObject( {
			store: 'coop',
			normalizedText: 'vaniljyoghurt 2,7%', // trailing price stripped by normalizeItemText
			kind: 'product',
			gtin: '7310865004703',
			price: 35.5,
			source: 'app',
		} );
	} );

	test( 'rejects a product kind with no gtin, and a non-product kind with one', async () => {
		const t = convexTest( schema, modules );
		await seedAccount( t );
		const asA = actingAs( t, 'sub-a' );
		await expect(
			asA.mutation( api.mappings.link, {
				token: 'tok-a',
				store: 'coop',
				text: 'MYSTERY ITEM',
				kind: 'product',
			} )
		).rejects.toThrow( 'gtin is required' );
		await expect(
			asA.mutation( api.mappings.link, {
				token: 'tok-a',
				store: 'coop',
				text: 'DISKBORSTE',
				kind: 'notFood',
				gtin: '123',
			} )
		).rejects.toThrow( 'gtin must be omitted' );
	} );

	test( 'rejects an unrecognized token', async () => {
		const t = convexTest( schema, modules );
		await seedAccount( t );
		await expect(
			t.mutation( api.mappings.link, {
				token: 'not-a-real-token',
				store: 'coop',
				text: 'MJÖLK',
				kind: 'notFood',
			} )
		).rejects.toThrow( 'Unauthenticated' );
	} );

	test( 'patches the same price group in place instead of duplicating it', async () => {
		const t = convexTest( schema, modules );
		await seedAccount( t );
		const asA = actingAs( t, 'sub-a' );
		const first = await asA.mutation( api.mappings.link, {
			token: 'tok-a',
			store: 'coop',
			text: 'HAVREGRYN',
			kind: 'product',
			gtin: 'wrong-ean',
			price: 19.9,
		} );
		const second = await asA.mutation( api.mappings.link, {
			token: 'tok-a',
			store: 'coop',
			text: 'HAVREGRYN',
			kind: 'product',
			gtin: 'right-ean',
			price: 19.9,
		} );
		expect( second ).toBe( first );
		const rows = await t.run( async ( ctx ) =>
			ctx.db.query( 'itemGtinMap' ).collect()
		);
		expect( rows ).toHaveLength( 1 );
		expect( rows[ 0 ]?.gtin ).toBe( 'right-ean' );
	} );

	test( 'a different price group on the same text gets its own row', async () => {
		const t = convexTest( schema, modules );
		await seedAccount( t );
		const asA = actingAs( t, 'sub-a' );
		await asA.mutation( api.mappings.link, {
			token: 'tok-a',
			store: 'coop',
			text: 'HAVREGRYN',
			kind: 'product',
			gtin: 'small',
			price: 19.9,
		} );
		await asA.mutation( api.mappings.link, {
			token: 'tok-a',
			store: 'coop',
			text: 'HAVREGRYN',
			kind: 'product',
			gtin: 'large',
			price: 34.9,
		} );
		const rows = await t.run( async ( ctx ) =>
			ctx.db.query( 'itemGtinMap' ).collect()
		);
		expect( rows ).toHaveLength( 2 );
	} );

	test( 'a resolved product row makes the receipt line resolve on the next read', async () => {
		const t = convexTest( schema, modules );
		const accountId = await seedAccount( t );
		const connectionId = await t.run(
			async ( ctx ) =>
				await ctx.db.insert( 'connections', {
					accountId,
					store: 'coop',
					accessToken: TEST_SEALED_SECRET,
					accessTokenExpiresAt: 0,
					refreshToken: TEST_SEALED_SECRET,
					status: 'active' as const,
				} )
		);
		const receiptId = await t.run( async ( ctx ) => {
			const r = await ctx.db.insert( 'receipts', {
				connectionId,
				accountId,
				source: 'coop',
				externalId: 'r-1',
				store: { name: 'Stora Coop' },
				currency: 'SEK',
				vat: [],
			} );
			await ctx.db.insert( 'receiptItems', {
				receiptId: r,
				lineNo: 0,
				text: 'PASTASÅS ARRABBIA. 22,24',
				price: 22.24,
				isDiscount: false,
			} );
			return r;
		} );

		const before = await actingAs( t, 'sub-a' ).query(
			api.receipts.getReceipt,
			{
				receiptId,
			}
		);
		expect( before?.items[ 0 ]?.kind ).toBeUndefined();

		await actingAs( t, 'sub-a' ).mutation( api.mappings.link, {
			token: 'tok-a',
			store: 'coop',
			text: 'PASTASÅS ARRABBIA. 22,24',
			kind: 'notInCatalog',
		} );

		const after = await actingAs( t, 'sub-a' ).query(
			api.receipts.getReceipt,
			{
				receiptId,
			}
		);
		expect( after?.items[ 0 ]?.kind ).toBe( 'notInCatalog' );
		expect( after?.items[ 0 ]?.gtin ).toBeUndefined();
	} );
} );

describe( 'mappings.unlink', () => {
	test( 'removes the matching row so the line goes back to unidentified', async () => {
		const t = convexTest( schema, modules );
		await seedAccount( t );
		const asA = actingAs( t, 'sub-a' );
		await asA.mutation( api.mappings.link, {
			token: 'tok-a',
			store: 'coop',
			text: 'DISKBORSTE',
			kind: 'notFood',
		} );
		await asA.mutation( api.mappings.unlink, {
			token: 'tok-a',
			store: 'coop',
			text: 'DISKBORSTE',
		} );
		const rows = await t.run( async ( ctx ) =>
			ctx.db.query( 'itemGtinMap' ).collect()
		);
		expect( rows ).toHaveLength( 0 );
	} );

	test( 'is a no-op when there is nothing to remove', async () => {
		const t = convexTest( schema, modules );
		await seedAccount( t );
		await expect(
			actingAs( t, 'sub-a' ).mutation( api.mappings.unlink, {
				token: 'tok-a',
				store: 'coop',
				text: 'NOTHING HERE',
			} )
		).resolves.toBeNull();
	} );
} );
