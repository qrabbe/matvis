/// <reference types="vite/client" />
import { STORES } from '@matvis/shared';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import schema from './schema';
import { upsertClean } from './model/project';

const modules = import.meta.glob( './**/*.ts' );

async function seed( t: ReturnType< typeof convexTest > ) {
	await t.run( async ( ctx ) => {
		await upsertClean( ctx, {
			ean: '7310865078216',
			name: 'Mjölk Laktosfri Standard',
			store: 'coop',
		} );
		await upsertClean( ctx, {
			ean: '7310865078216',
			name: 'Mjölk Laktosfri 3% 1l',
			store: 'ica',
		} );
	} );
}

const CONTRACT_FIELDS = new Set( [ 'ean', 'name', 'store', 'fetchedAt' ] );

describe( 'GET /product', () => {
	test( 'answers every store row for an EAN, none of the internal fields', async () => {
		const t = convexTest( schema, modules );
		await seed( t );

		const response = await t.fetch( '/product?ean=7310865078216' );
		expect( response.status ).toBe( 200 );
		expect( response.headers.get( 'access-control-allow-origin' ) ).toBe(
			'*'
		);
		expect( response.headers.get( 'content-type' ) ).toBe(
			'application/json; charset=utf-8'
		);

		const rows = ( await response.json() ) as Record< string, unknown >[];
		expect( rows.map( ( row ) => row.store ).sort() ).toEqual( [
			'coop',
			'ica',
		] );
		for ( const row of rows ) {
			expect( Object.keys( row ).sort() ).toEqual(
				[ ...CONTRACT_FIELDS ].sort()
			);
		}
	} );

	test( 'filters to one store, and answers [] for an unknown EAN', async () => {
		const t = convexTest( schema, modules );
		await seed( t );

		const filtered = await t.fetch(
			'/product?ean=7310865078216&store=ica'
		);
		const rows = ( await filtered.json() ) as { store: string }[];
		expect( rows.map( ( row ) => row.store ) ).toEqual( [ 'ica' ] );

		const missing = await t.fetch( '/product?ean=0000000000000' );
		expect( await missing.json() ).toEqual( [] );
	} );

	test( '400s on a missing ean or an unknown store', async () => {
		const t = convexTest( schema, modules );

		const noEan = await t.fetch( '/product' );
		expect( noEan.status ).toBe( 400 );
		expect( await noEan.json() ).toEqual( { error: 'ean is required' } );

		const badStore = await t.fetch(
			'/product?ean=7310865078216&store=nope'
		);
		expect( badStore.status ).toBe( 400 );
		const body = ( await badStore.json() ) as { error: string };
		for ( const store of STORES ) {
			expect( body.error ).toContain( store );
		}
	} );
} );

describe( 'GET /search', () => {
	test( 'returns up to 10 rows, best match first, without dedupe', async () => {
		const t = convexTest( schema, modules );
		await seed( t );

		const response = await t.fetch( '/search?q=mj%C3%B6lk' );
		const rows = ( await response.json() ) as {
			name: string;
			store: string;
		}[];
		expect( rows ).toHaveLength( 2 );
		expect( new Set( rows.map( ( row ) => row.store ) ) ).toEqual(
			new Set( [ 'coop', 'ica' ] )
		);
	} );

	test( '400s on a missing q', async () => {
		const t = convexTest( schema, modules );
		const response = await t.fetch( '/search' );
		expect( response.status ).toBe( 400 );
		expect( await response.json() ).toEqual( { error: 'q is required' } );
	} );
} );
