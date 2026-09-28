import { describe, expect, it } from 'bun:test';
import type { CatalogRow, ReceiptHeader, ReceiptItemDoc } from '@matvis/shared';
import { groupTrips, tripDotState } from '../../src/lib/trips';
import type { MarkRow } from '../../src/lib/app-backend-api';
import { expandLineToUnits, type PantryUnit } from '../../src/lib/pantry-units';
import type { PurchaseLine } from '../../src/lib/purchases';

function catalogProduct( ean: string ): CatalogRow {
	return {
		_id: `catalog_${ ean }` as CatalogRow[ '_id' ],
		_creationTime: 0,
		ean,
		name: `Product ${ ean }`,
		store: 'coop',
		sourceTable: 'raw_coop',
		sourceId: 'raw_1',
	};
}

let seq = 0;

function line(
	receiptId: string,
	purchasedAt: string,
	overrides: Partial< ReceiptItemDoc > = {}
): PurchaseLine {
	seq += 1;
	const item: ReceiptItemDoc = {
		_id: `item_${ seq }` as ReceiptItemDoc[ '_id' ],
		_creationTime: 0,
		receiptId: receiptId as ReceiptItemDoc[ 'receiptId' ],
		lineNo: seq,
		text: `LINE ${ seq }`,
		price: 20,
		isDiscount: false,
		kind: 'product',
		gtin: `ean_${ seq }`,
		...overrides,
	};
	return {
		item,
		header: { _id: receiptId } as ReceiptHeader,
		day: purchasedAt.slice( 0, 10 ),
		purchasedAt: new Date( purchasedAt ),
		product: item.gtin ? catalogProduct( item.gtin ) : null,
		macros: null,
	};
}

function mark( forLine: PurchaseLine, unitIndex = 0 ): MarkRow {
	return {
		_id: `mark_${ seq }`,
		_creationTime: 0,
		receiptId: forLine.header._id,
		lineNo: forLine.item.lineNo,
		unitIndex,
		outcome: 'finished',
		finishedAt: Date.now(),
		finishedAtHandSet: false,
		via: 'tap',
	};
}

describe( 'tripDotState', () => {
	const units: PantryUnit[] = []; // dot logic doesn't need real unit contents here

	it( 'is green when every unit is marked and nothing is unidentified', () => {
		expect( tripDotState( units, new Set(), false ) ).toBe( 'green' );
	} );

	it( 'is red whenever something on the receipt is unidentified, even if everything else is marked', () => {
		expect( tripDotState( units, new Set(), true ) ).toBe( 'red' );
	} );

	it( 'is orange when some pantry-eligible unit is still unmarked', () => {
		const l = line( 'r1', '2026-09-20T00:00:00Z' );
		const [ u ] = expandLineToUnits( l );
		expect( tripDotState( [ u! ], new Set(), false ) ).toBe( 'orange' );
	} );
} );

describe( 'groupTrips', () => {
	it( 'groups lines by receipt, newest first', () => {
		const trips = groupTrips(
			[
				line( 'old', '2026-09-01T00:00:00Z' ),
				line( 'new', '2026-09-20T00:00:00Z' ),
			],
			[]
		);
		expect( trips.map( ( t ) => t.receiptId ) ).toEqual( [ 'new', 'old' ] );
	} );

	it( 'is green once every pantry-eligible unit on the trip is marked', () => {
		const l = line( 'r1', '2026-09-20T00:00:00Z' );
		const trips = groupTrips( [ l ], [ mark( l ) ] );
		expect( trips[ 0 ]?.dotState ).toBe( 'green' );
		expect( trips[ 0 ]?.outstandingUnits ).toHaveLength( 0 );
		expect( trips[ 0 ]?.finishedUnits ).toHaveLength( 1 );
	} );

	it( 'is red when a line has no kind at all, and counts it as to-identify', () => {
		const identified = line( 'r1', '2026-09-20T00:00:00Z' );
		const unidentified = line( 'r1', '2026-09-20T00:00:00Z', {
			kind: undefined,
			gtin: undefined,
		} );
		const trips = groupTrips(
			[ identified, unidentified ],
			[ mark( identified ) ]
		);
		expect( trips[ 0 ]?.dotState ).toBe( 'red' );
		expect( trips[ 0 ]?.toIdentifyCount ).toBe( 1 );
	} );

	it( 'never lets a notInCatalog line keep a trip orange', () => {
		const l = line( 'r1', '2026-09-20T00:00:00Z', {
			kind: 'notInCatalog',
			gtin: undefined,
		} );
		const trips = groupTrips( [ l ], [] );
		expect( trips[ 0 ]?.dotState ).toBe( 'green' );
	} );

	it( 'sums spend across the receipt’s food lines', () => {
		const trips = groupTrips(
			[
				line( 'r1', '2026-09-20T00:00:00Z', { price: 30 } ),
				line( 'r1', '2026-09-20T00:00:00Z', { price: 12.5 } ),
			],
			[]
		);
		expect( trips[ 0 ]?.spend ).toBe( 42.5 );
	} );

	it( 'excludes discount lines from spend and from unit counts', () => {
		const trips = groupTrips(
			[
				line( 'r1', '2026-09-20T00:00:00Z', { price: 30 } ),
				line( 'r1', '2026-09-20T00:00:00Z', {
					price: -5,
					isDiscount: true,
				} ),
			],
			[]
		);
		expect( trips[ 0 ]?.spend ).toBe( 30 );
		expect( trips[ 0 ]?.units ).toHaveLength( 1 );
	} );
} );
