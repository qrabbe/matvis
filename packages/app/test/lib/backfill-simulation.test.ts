import { describe, expect, it } from 'bun:test';
import type { CatalogRow, ReceiptHeader, ReceiptItemDoc } from '@matvis/shared';
import {
	simulateBackfill,
	simulateGroupBackfill,
} from '../../src/lib/backfill-simulation';
import { expandLineToUnits } from '../../src/lib/pantry-units';
import type { PurchaseLine } from '../../src/lib/purchases';

let seq = 0;

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
		product: catalogProduct( gtin ),
		macros: null,
	};
}

const day = ( n: number ) => new Date( 2026, 0, 1 + n ).getTime();

describe( 'simulateGroupBackfill', () => {
	it( 'finishes a single unit bought and estimated to be long gone by tracking start', () => {
		const [ unit ] = expandLineToUnits(
			line( 'a', '2026-01-01T00:00:00' )
		);
		const marks = simulateGroupBackfill(
			[ unit! ],
			{ daysToFinish: 3 },
			day( 30 )
		);
		expect( marks ).toHaveLength( 1 );
		expect( marks[ 0 ]?.finishedAt ).toBeLessThan( day( 30 ) );
	} );

	it( 'caps a unit at tracking start when its estimated finish would otherwise land in the future', () => {
		const [ unit ] = expandLineToUnits(
			line( 'a', '2026-01-29T00:00:00' )
		);
		const marks = simulateGroupBackfill(
			[ unit! ],
			{ daysToFinish: 3 },
			day( 30 )
		);
		expect( marks ).toHaveLength( 1 );
		expect( marks[ 0 ]?.finishedAt ).toBe( day( 30 ) );
		expect( marks[ 0 ]?.startedAt ).toBeLessThanOrEqual( day( 30 ) );
	} );

	it( 'stays every unit finishing off its own purchase date, regardless of how often the product is bought', () => {
		// Bought every 2.5 days for 60 days (~24 purchases) at a 4-day
		// estimate. Every unit finishes its own 4 days after its own purchase,
		// there's no queueing between units of the same product.
		const units = [];
		for ( let i = 0; i < 24; i++ ) {
			const purchasedAt = new Date( 2026, 0, 1 + i * 2.5 ).toISOString();
			units.push(
				expandLineToUnits( line( 'milk', purchasedAt ) )[ 0 ]!
			);
		}
		const trackingStart = new Date( 2026, 0, 1 + 24 * 2.5 + 30 ).getTime();
		const marks = simulateGroupBackfill(
			units,
			{ daysToFinish: 4 },
			trackingStart
		);
		expect( marks ).toHaveLength( 24 );
		for ( const mark of marks ) {
			expect( mark.finishedAt - mark.startedAt ).toBe( 4 * 86_400_000 );
		}
	} );

	it( 'stalls three units bought together, one after another, instead of finishing them all at once', () => {
		const purchasedAt = '2026-01-01T00:00:00';
		const units = expandLineToUnits(
			line( 'milk', purchasedAt, { quantity: 3, unit: 'st' } )
		);
		const trackingStart = day( 60 );
		const marks = simulateGroupBackfill(
			units,
			{ daysToFinish: 4 },
			trackingStart
		);
		const sorted = [ ...marks ].sort(
			( a, b ) => a.unitIndex - b.unitIndex
		);
		expect( sorted[ 0 ]?.startedAt ).toBe(
			new Date( purchasedAt ).getTime()
		);
		expect( sorted[ 1 ]?.startedAt ).toBe( sorted[ 0 ]?.finishedAt );
		expect( sorted[ 2 ]?.startedAt ).toBe( sorted[ 1 ]?.finishedAt );
	} );

	it( 'never estimates past the shelf-life cap', () => {
		const units = [ 0, 40, 80 ].map(
			( offset ) =>
				expandLineToUnits(
					line(
						'lime-juice',
						new Date( 2026, 0, 1 + offset ).toISOString()
					)
				)[ 0 ]!
		);
		const trackingStart = new Date( 2026, 0, 1 + 80 + 5 ).getTime();
		const marks = simulateGroupBackfill(
			units,
			{ daysToFinish: 365, maxDaysFromPurchase: 60 },
			trackingStart
		);
		for ( const mark of marks ) {
			expect( mark.finishedAt - mark.startedAt ).toBeLessThanOrEqual(
				60 * 86_400_000
			);
		}
	} );
} );

describe( 'simulateBackfill', () => {
	it( 'runs every product group independently, marking everything finished', () => {
		const lines = [
			line( 'a', '2026-01-01T00:00:00' ), // long gone by day 30
			line( 'b', '2026-01-29T00:00:00' ), // not due yet at day 30
		];
		const marks = simulateBackfill(
			lines,
			new Map( [
				[ 'product:a', { daysToFinish: 2 } ],
				[ 'product:b', { daysToFinish: 2 } ],
			] ),
			day( 30 )
		);
		expect( marks ).toHaveLength( 2 );
	} );

	it( 'falls back to the flat default duration for a group with no estimate', () => {
		const lines = [ line( 'unknown', '2026-01-01T00:00:00' ) ];
		const marks = simulateBackfill( lines, new Map(), day( 30 ), 5 );
		expect( marks ).toHaveLength( 1 );
	} );

	it( 'still marks a notFood or unidentified line finished, under the flat default', () => {
		const lines = [
			line( 'a', '2026-01-01T00:00:00', {
				kind: 'notFood',
				gtin: undefined,
			} ),
			line( 'a', '2026-01-01T00:00:00', {
				kind: undefined,
				gtin: undefined,
			} ),
		];
		const marks = simulateBackfill( lines, new Map(), day( 30 ) );
		expect( marks ).toHaveLength( 2 );
	} );
} );
