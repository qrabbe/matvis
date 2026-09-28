/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { upsertClean } from './model/project';
import {
	getCategory,
	listCategoryLevel,
	searchCategoryBranch,
} from './model/portalReads';

const modules = import.meta.glob( './**/*.ts' );

async function seed( t: ReturnType< typeof convexTest > ) {
	await t.run( async ( ctx ) => {
		await upsertClean( ctx, {
			ean: '1',
			name: 'Vispgrädde',
			store: 'coop',
			categoryPath: [ 'Mejeri & Ägg', 'Grädde' ],
		} );
		await upsertClean( ctx, {
			ean: '2',
			name: 'Standardmjölk',
			store: 'coop',
			categoryPath: [ 'Mejeri & Ägg', 'Mjölk', 'Standardmjölk' ],
		} );
		await upsertClean( ctx, {
			ean: '3',
			name: 'Lagrad ost',
			store: 'coop',
			categoryPath: [ 'Mejeri & Ägg', 'Ost' ],
		} );
		await upsertClean( ctx, {
			ean: '4',
			name: 'Löskokta ägg',
			store: 'coop',
			categoryPath: [ 'Mejeri & Ägg', 'Ägg & Jäst' ],
		} );
		await upsertClean( ctx, {
			ean: '5',
			name: 'Kex',
			store: 'coop',
		} );
	} );
	await t.action( internal.backfill.rebuildCategoryTree, {} );
}

describe( 'rebuildCategoryTree', () => {
	test( 'rolls a branch count up from every leaf beneath it', async () => {
		const t = convexTest( schema, modules );
		await seed( t );

		const top = await t.run( ( ctx ) =>
			getCategory( ctx, 'coop', 'mejeri-agg' )
		);
		expect( top?.count ).toBe( 4 );
		expect( top?.hasChildren ).toBe( true );

		const mjolk = await t.run( ( ctx ) =>
			getCategory( ctx, 'coop', 'mejeri-agg/mjolk' )
		);
		expect( mjolk?.count ).toBe( 1 );
		expect( mjolk?.hasChildren ).toBe( true );

		const standardmjolk = await t.run( ( ctx ) =>
			getCategory( ctx, 'coop', 'mejeri-agg/mjolk/standardmjolk' )
		);
		expect( standardmjolk?.count ).toBe( 1 );
		expect( standardmjolk?.hasChildren ).toBe( false );
	} );

	test( 'an unknown slug path is null, and rows with no usable path land in Other', async () => {
		const t = convexTest( schema, modules );
		await seed( t );

		expect(
			await t.run( ( ctx ) => getCategory( ctx, 'coop', 'nope' ) )
		).toBeNull();

		const other = await t.run( ( ctx ) =>
			getCategory( ctx, 'coop', 'other' )
		);
		expect( other?.count ).toBe( 1 );
		expect( other?.hasChildren ).toBe( false );
	} );

	test( 'the path line carries display names, not slugs', async () => {
		const t = convexTest( schema, modules );
		await seed( t );

		const node = await t.run( ( ctx ) =>
			getCategory( ctx, 'coop', 'mejeri-agg/mjolk' )
		);
		expect( node?.path ).toEqual( [ 'Mejeri & Ägg', 'Mjölk' ] );
	} );

	test( 'a second run is idempotent', async () => {
		const t = convexTest( schema, modules );
		await seed( t );
		await t.action( internal.backfill.rebuildCategoryTree, {} );

		const top = await t.run( ( ctx ) =>
			getCategory( ctx, 'coop', 'mejeri-agg' )
		);
		expect( top?.count ).toBe( 4 );
	} );
} );

describe( 'listCategoryLevel', () => {
	test( 'is sorted A-Ö with Other last, and only lists direct children', async () => {
		const t = convexTest( schema, modules );
		await seed( t );

		const top = await t.run( ( ctx ) =>
			listCategoryLevel( ctx, 'coop', '' )
		);
		expect( top.map( ( row ) => row.slug ) ).toEqual( [
			'mejeri-agg',
			'other',
		] );

		const children = await t.run( ( ctx ) =>
			listCategoryLevel( ctx, 'coop', 'mejeri-agg' )
		);
		// Ägg & Jäst folds to a leading char that sorts after every ASCII letter,
		// so it lands last even though it precedes Ost alphabetically in Swedish
		// spelling.
		expect( children.map( ( row ) => row.name ) ).toEqual( [
			'Grädde',
			'Mjölk',
			'Ost',
			'Ägg & Jäst',
		] );
		expect(
			children.find( ( row ) => row.name === 'Mjölk' )?.hasChildren
		).toBe( true );
		expect(
			children.find( ( row ) => row.name === 'Grädde' )?.hasChildren
		).toBe( false );
	} );
} );

describe( 'searchCategoryBranch', () => {
	test( 'a branch page reaches every leaf beneath it, in shelf order', async () => {
		const t = convexTest( schema, modules );
		await seed( t );

		const top = await t.run( ( ctx ) =>
			getCategory( ctx, 'coop', 'mejeri-agg' )
		);
		const page = await t.run( ( ctx ) =>
			searchCategoryBranch( ctx, 'coop', top!.categoryKey, {
				cursor: null,
				numItems: 10,
			} )
		);
		expect( page.page.map( ( row ) => row.name ) ).toEqual( [
			'Vispgrädde',
			'Standardmjölk',
			'Lagrad ost',
			'Löskokta ägg',
		] );
	} );
} );
