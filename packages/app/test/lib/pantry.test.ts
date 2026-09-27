import { describe, expect, it } from 'bun:test';
import type { CatalogRow, ReceiptHeader, ReceiptItemDoc } from '@matvis/shared';
import {
	groupPantryTiles,
	sortDueFirst,
	sortNewestFirst,
	sortOldestFirst,
	splitStaples,
	STAPLE_THRESHOLD_DAYS,
} from '../../src/lib/pantry';
import type { MarkRow } from '../../src/lib/appBackendApi';
import type { PurchaseLine } from '../../src/lib/purchases';

function catalogProduct( ean: string, name = `Product ${ ean }` ): CatalogRow {
	return {
		_id: `catalog_${ ean }` as CatalogRow[ '_id' ],
		_creationTime: 0,
		ean,
		name,
		store: 'coop',
		sourceTable: 'raw_coop',
		sourceId: 'raw_1',
	};
}

let seq = 0;

function line(
	gtin: string,
	purchasedAt: string,
	overrides: Partial< ReceiptItemDoc > = {}
): PurchaseLine {
	seq += 1;
	const item: ReceiptItemDoc = {
		_id: `item_${ seq }` as ReceiptItemDoc[ '_id' ],
		_creationTime: 0,
		receiptId: `receipt_${ seq }` as ReceiptItemDoc[ 'receiptId' ],
		lineNo: 0,
		text: `LINE ${ gtin }`,
		price: 20,
		isDiscount: false,
		gtin,
		kind: 'product',
		...overrides,
	};
	return {
		item,
		header: { _id: item.receiptId } as ReceiptHeader,
		day: purchasedAt.slice( 0, 10 ),
		purchasedAt: new Date( purchasedAt ),
		product: item.gtin ? catalogProduct( item.gtin ) : null,
		macros: null,
	};
}

function mark(
	line: PurchaseLine,
	unitIndex: number,
	finishedAt: string,
	overrides: Partial< MarkRow > = {}
): MarkRow {
	return {
		_id: `mark_${ seq }`,
		_creationTime: 0,
		receiptId: line.header._id,
		lineNo: line.item.lineNo,
		unitIndex,
		outcome: 'finished',
		finishedAt: Date.parse( finishedAt ),
		finishedAtHandSet: false,
		via: 'tap',
		...overrides,
	};
}

const TODAY = new Date( '2026-09-24T12:00:00Z' );

describe( 'groupPantryTiles', () => {
	it( 'groups every outstanding unit of a product into one tile', () => {
		const tiles = groupPantryTiles(
			[
				line( '111', '2026-09-20T00:00:00Z' ),
				line( '111', '2026-09-22T00:00:00Z' ),
			],
			[],
			TODAY
		);
		expect( tiles ).toHaveLength( 1 );
		expect( tiles[ 0 ]?.outstandingUnits ).toHaveLength( 2 );
		expect( tiles[ 0 ]?.name ).toBe( 'Product 111' );
	} );

	it( 'never tiles a not-food, not-in-catalog, or unidentified line', () => {
		for ( const kind of [
			'notFood',
			'notInCatalog',
			undefined,
		] as const ) {
			const tiles = groupPantryTiles(
				[
					line( '111', '2026-09-20T00:00:00Z', {
						kind,
						gtin: undefined,
					} ),
				],
				[],
				TODAY
			);
			expect( tiles ).toEqual( [] );
		}
	} );

	it( 'drops a unit once it is marked finished, and the tile once every unit is', () => {
		const l = line( '111', '2026-09-20T00:00:00Z' );
		const tiles = groupPantryTiles(
			[ l ],
			[ mark( l, 0, '2026-09-23T00:00:00Z' ) ],
			TODAY
		);
		expect( tiles ).toEqual( [] );
	} );

	it( 'leaves the still-outstanding units when only some of a group are marked', () => {
		const a = line( '111', '2026-09-01T00:00:00Z' );
		const b = line( '111', '2026-09-20T00:00:00Z' );
		const tiles = groupPantryTiles(
			[ a, b ],
			[ mark( a, 0, '2026-09-10T00:00:00Z' ) ],
			TODAY
		);
		expect( tiles ).toHaveLength( 1 );
		expect( tiles[ 0 ]?.outstandingUnits ).toHaveLength( 1 );
		expect( tiles[ 0 ]?.outstandingUnits[ 0 ]?.purchasedAt ).toEqual(
			b.purchasedAt
		);
	} );

	it( 'groups loose produce by normalized text, giving each a tile with no catalog product', () => {
		const tiles = groupPantryTiles(
			[
				line( '', '2026-09-20T00:00:00Z', {
					kind: 'produce',
					gtin: undefined,
					text: 'TOMATER KVIST KG SVE 30,31',
				} ),
			],
			[],
			TODAY
		);
		expect( tiles ).toHaveLength( 1 );
		expect( tiles[ 0 ]?.kind ).toBe( 'produce' );
		expect( tiles[ 0 ]?.product ).toBeNull();
	} );

	it( 'is overdue (negative dueInDays) once a unit has sat past its typical duration', () => {
		const l = line( '111', '2026-09-01T00:00:00Z' ); // 23 days old at TODAY
		const tiles = groupPantryTiles( [ l ], [], TODAY, () => 7 ); // estimate: lasts 7 days
		expect( tiles[ 0 ]?.dueInDays ).toBeLessThan( 0 );
	} );

	it( 'flags a tile a staple once its typical duration passes the threshold', () => {
		const l = line( '111', '2026-09-20T00:00:00Z' );
		const tiles = groupPantryTiles(
			[ l ],
			[],
			TODAY,
			() => STAPLE_THRESHOLD_DAYS + 1
		);
		expect( tiles[ 0 ]?.isStaple ).toBe( true );
	} );
} );

describe( 'sorting', () => {
	function tilesFor() {
		const soonestDue = line( 'soon', '2026-09-23T00:00:00Z' ); // 1 day old, lasts 2 → due in 1
		const overdue = line( 'over', '2026-09-01T00:00:00Z' ); // 23 days old, lasts 5 → due in -18
		const notYet = line( 'later', '2026-09-24T00:00:00Z' ); // 0 days old, lasts 30 → due in 30
		return groupPantryTiles(
			[ soonestDue, overdue, notYet ],
			[],
			TODAY,
			( groupKey ) =>
				( {
					'product:soon': 2,
					'product:over': 5,
					'product:later': 30,
				} )[ groupKey ]
		);
	}

	it( 'due first puts the most overdue tile on top, then soonest-due', () => {
		const sorted = sortDueFirst( tilesFor() );
		expect( sorted.map( ( t ) => t.groupKey ) ).toEqual( [
			'product:over',
			'product:soon',
			'product:later',
		] );
	} );

	it( 'oldest first orders by first purchase date', () => {
		const sorted = sortOldestFirst( tilesFor() );
		expect( sorted.map( ( t ) => t.groupKey ) ).toEqual( [
			'product:over',
			'product:soon',
			'product:later',
		] );
	} );

	it( 'newest first orders by last purchase date, descending', () => {
		const sorted = sortNewestFirst( tilesFor() );
		expect( sorted.map( ( t ) => t.groupKey ) ).toEqual( [
			'product:later',
			'product:soon',
			'product:over',
		] );
	} );
} );

describe( 'splitStaples', () => {
	it( 'separates staples from the regular grid without losing any tile', () => {
		const regular = line( '111', '2026-09-20T00:00:00Z' );
		const staple = line( '222', '2026-09-20T00:00:00Z' );
		const tiles = groupPantryTiles(
			[ regular, staple ],
			[],
			TODAY,
			( groupKey ) => ( groupKey === 'product:222' ? 60 : 5 )
		);
		const split = splitStaples( tiles );
		expect( split.regular.map( ( t ) => t.groupKey ) ).toEqual( [
			'product:111',
		] );
		expect( split.staples.map( ( t ) => t.groupKey ) ).toEqual( [
			'product:222',
		] );
	} );
} );
