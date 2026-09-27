import { describe, expect, it } from 'bun:test';
import {
	averagePerDay,
	countedShare,
	daysCovered,
	eatenSpans,
	forecastByDay,
	intakeByDay,
	intakeSources,
	lastBackfillDay,
	summarizeSources,
	unitsPastDue,
	wasteSummary,
} from '../../src/lib/intake';
import {
	expandLineToUnits,
	unitPrice,
	type PantryUnit,
} from '../../src/lib/pantry-units';
import { ZERO_MACROS, type Macros } from '../../src/lib/nutrition';
import type { MarkRow } from '../../src/lib/app-backend-api';
import type { CatalogRow, ReceiptHeader, ReceiptItemDoc } from '@matvis/shared';
import type { PurchaseLine } from '../../src/lib/purchases';

let lineSeq = 0;

function line(
	name: string,
	opts: {
		macros?: Partial< Macros > | null;
		price?: number;
		purchased?: string;
		categoryPath?: string[];
		count?: number;
	} = {}
): PurchaseLine {
	lineSeq += 1;
	const gtin = `ean_${ name }`;
	const item: ReceiptItemDoc = {
		_id: `item_${ lineSeq }` as ReceiptItemDoc[ '_id' ],
		_creationTime: 0,
		receiptId: 'r1' as ReceiptItemDoc[ 'receiptId' ],
		lineNo: lineSeq,
		text: name.toUpperCase(),
		price: opts.price ?? 20,
		isDiscount: false,
		gtin,
		kind: 'product',
		...( opts.count ? { quantity: opts.count, unit: 'st' } : {} ),
	};
	const product: CatalogRow = {
		_id: `catalog_${ gtin }` as CatalogRow[ '_id' ],
		_creationTime: 0,
		ean: gtin,
		name,
		store: 'coop',
		sourceTable: 'raw_coop',
		sourceId: 'raw_1',
		...( opts.categoryPath ? { categoryPath: opts.categoryPath } : {} ),
	};
	const purchasedAt = new Date(
		`${ opts.purchased ?? '2026-09-01' }T10:00:00`
	);
	return {
		item,
		header: { _id: 'r1' } as ReceiptHeader,
		day: opts.purchased ?? '2026-09-01',
		purchasedAt,
		product,
		macros:
			opts.macros === null
				? null
				: { ...ZERO_MACROS, ...( opts.macros ?? {} ) },
	};
}

function unitOf( l: PurchaseLine ): PantryUnit {
	return expandLineToUnits( l )[ 0 ]!;
}

function mark(
	unit: PantryUnit,
	finished: string,
	overrides: Partial< MarkRow > = {}
): MarkRow {
	return {
		_id: `m_${ unit.key }`,
		_creationTime: 0,
		receiptId: unit.receiptId,
		lineNo: unit.lineNo,
		unitIndex: unit.unitIndex,
		outcome: 'finished',
		finishedAt: new Date( `${ finished }T12:00:00` ).getTime(),
		finishedAtHandSet: false,
		via: 'tap',
		...overrides,
	};
}

function started( day: string ): number {
	return new Date( `${ day }T08:00:00` ).getTime();
}

function byKey( ...units: PantryUnit[] ): Map< string, PantryUnit > {
	return new Map( units.map( ( u ) => [ u.key, u ] ) );
}

describe( 'eatenSpans', () => {
	it( 'runs from the purchase day to the finish day when no Started was set', () => {
		const unit = unitOf( line( 'Milk', { purchased: '2026-09-18' } ) );
		const [ span ] = eatenSpans(
			[ mark( unit, '2026-09-20' ) ],
			byKey( unit )
		);
		expect( span?.days ).toEqual( [
			'2026-09-18',
			'2026-09-19',
			'2026-09-20',
		] );
	} );

	it( 'uses a Started date set by hand', () => {
		const unit = unitOf( line( 'Milk', { purchased: '2026-09-01' } ) );
		const [ span ] = eatenSpans(
			[
				mark( unit, '2026-09-20', {
					startedAt: started( '2026-09-19' ),
				} ),
			],
			byKey( unit )
		);
		expect( span?.days ).toEqual( [ '2026-09-19', '2026-09-20' ] );
	} );

	it( 'never includes a unit thrown away, or one whose receipt is not loaded', () => {
		const wasted = unitOf( line( 'Hummus' ) );
		const missing = unitOf( line( 'Bread' ) );
		const spans = eatenSpans(
			[
				mark( wasted, '2026-09-20', { outcome: 'wasted' } ),
				mark( missing, '2026-09-20' ),
			],
			byKey( wasted )
		);
		expect( spans ).toEqual( [] );
	} );

	it( 'flags backfill marks', () => {
		const unit = unitOf( line( 'Rice' ) );
		const [ span ] = eatenSpans(
			[
				mark( unit, '2026-09-10', {
					source: 'backfill',
					via: 'backfill',
				} ),
			],
			byKey( unit )
		);
		expect( span?.fromBackfill ).toBe( true );
	} );
} );

describe( 'intakeByDay', () => {
	it( 'puts a one-day span entirely on that day', () => {
		const unit = unitOf(
			line( 'Milk', { macros: { kcal: 200 }, purchased: '2026-09-20' } )
		);
		const days = intakeByDay(
			eatenSpans( [ mark( unit, '2026-09-20' ) ], byKey( unit ) )
		);
		expect( days ).toHaveLength( 1 );
		expect( days[ 0 ]?.marked.kcal ).toBe( 200 );
	} );

	it( 'spreads a unit evenly across its days', () => {
		const unit = unitOf(
			line( 'Rice', { macros: { kcal: 1000 }, purchased: '2026-09-01' } )
		);
		const days = intakeByDay(
			eatenSpans( [ mark( unit, '2026-09-05' ) ], byKey( unit ) )
		);
		expect( days.map( ( d ) => d.marked.kcal ) ).toEqual( [
			200, 200, 200, 200, 200,
		] );
	} );

	it( 'gives each package of an "xN st" line its own share', () => {
		const units = expandLineToUnits(
			line( 'Yoghurt', {
				macros: { kcal: 400 },
				count: 4,
				purchased: '2026-09-20',
			} )
		);
		const days = intakeByDay(
			eatenSpans(
				[ mark( units[ 0 ]!, '2026-09-20' ) ],
				byKey( ...units )
			)
		);
		expect( days[ 0 ]?.marked.kcal ).toBe( 100 );
	} );

	it( 'adds nothing for a unit without usable nutrition', () => {
		const unit = unitOf(
			line( 'Tomatoes', { macros: null, purchased: '2026-09-20' } )
		);
		expect(
			intakeByDay(
				eatenSpans( [ mark( unit, '2026-09-20' ) ], byKey( unit ) )
			)
		).toEqual( [] );
	} );

	it( 'keeps backfill estimates apart from marks', () => {
		const tapped = unitOf(
			line( 'Milk', { macros: { kcal: 300 }, purchased: '2026-09-20' } )
		);
		const played = unitOf(
			line( 'Bread', { macros: { kcal: 500 }, purchased: '2026-09-20' } )
		);
		const [ day ] = intakeByDay(
			eatenSpans(
				[
					mark( tapped, '2026-09-20' ),
					mark( played, '2026-09-20', {
						source: 'backfill',
						via: 'backfill',
					} ),
				],
				byKey( tapped, played )
			)
		);
		expect( day?.marked.kcal ).toBe( 300 );
		expect( day?.backfill.kcal ).toBe( 500 );
	} );
} );

describe( 'averagePerDay', () => {
	const week = { from: '2026-09-20', to: '2026-09-26' };

	it( 'divides by every day of the range, not only the days with marks', () => {
		const unit = unitOf(
			line( 'Milk', { macros: { kcal: 700 }, purchased: '2026-09-22' } )
		);
		const days = intakeByDay(
			eatenSpans( [ mark( unit, '2026-09-22' ) ], byKey( unit ) )
		);
		expect( averagePerDay( days, week ).kcal ).toBeCloseTo( 100, 6 );
	} );

	it( 'counts only the days of a span that fall inside the range', () => {
		const unit = unitOf(
			line( 'Oats', { macros: { kcal: 1000 }, purchased: '2026-09-14' } )
		);
		const days = intakeByDay(
			eatenSpans( [ mark( unit, '2026-09-23' ) ], byKey( unit ) )
		);
		expect( averagePerDay( days, week ).kcal ).toBeCloseTo(
			( 1000 * 4 ) / 10 / 7,
			6
		);
	} );

	it( 'includes backfill estimates', () => {
		const unit = unitOf(
			line( 'Rice', { macros: { kcal: 700 }, purchased: '2026-09-20' } )
		);
		const days = intakeByDay(
			eatenSpans(
				[
					mark( unit, '2026-09-20', {
						source: 'backfill',
						via: 'backfill',
					} ),
				],
				byKey( unit )
			)
		);
		expect( averagePerDay( days, week ).kcal ).toBeCloseTo( 100, 6 );
	} );
} );

describe( 'lastBackfillDay', () => {
	it( 'is the latest day carrying backfill intake, or null without any', () => {
		const played = unitOf(
			line( 'Rice', { macros: { kcal: 500 }, purchased: '2026-09-10' } )
		);
		const tapped = unitOf(
			line( 'Milk', { macros: { kcal: 300 }, purchased: '2026-09-25' } )
		);
		const days = intakeByDay(
			eatenSpans(
				[
					mark( played, '2026-09-12', {
						source: 'backfill',
						via: 'backfill',
					} ),
					mark( tapped, '2026-09-25' ),
				],
				byKey( played, tapped )
			)
		);
		expect( lastBackfillDay( days ) ).toBe( '2026-09-12' );
		expect(
			lastBackfillDay( days.filter( ( d ) => d.day === '2026-09-25' ) )
		).toBeNull();
	} );
} );

describe( 'forecastByDay', () => {
	const today = new Date( '2026-09-25T15:00:00' );
	const tile = (
		typicalDurationDays: number,
		...outstandingUnits: PantryUnit[]
	) => ( {
		typicalDurationDays,
		outstandingUnits,
	} );

	it( 'draws only the share of the expected span that lies after today', () => {
		const unit = unitOf(
			line( 'Oats', { macros: { kcal: 1100 }, purchased: '2026-09-20' } )
		);
		const days = forecastByDay( [ tile( 10, unit ) ], today );
		expect( days.map( ( d ) => d.day ) ).toEqual( [
			'2026-09-26',
			'2026-09-27',
			'2026-09-28',
			'2026-09-29',
			'2026-09-30',
		] );
		for ( const d of days ) {
			expect( d.macros.kcal ).toBeCloseTo( 100, 6 );
		}
	} );

	it( 'leaves out a unit already past its usual time, and counts it', () => {
		const late = unitOf(
			line( 'Milk', { macros: { kcal: 700 }, purchased: '2026-09-20' } )
		);
		const fresh = unitOf(
			line( 'Oats', { macros: { kcal: 1100 }, purchased: '2026-09-20' } )
		);
		const tiles = [ tile( 3, late ), tile( 10, fresh ) ];
		const days = forecastByDay( tiles, today );
		expect( days ).toHaveLength( 5 );
		for ( const d of days ) {
			expect( d.macros.kcal ).toBeCloseTo( 100, 6 );
		}
		expect( unitsPastDue( tiles, today ) ).toBe( 1 );
	} );

	it( 'skips units without nutrition or without a usable duration', () => {
		const noMacros = unitOf(
			line( 'Tomatoes', { macros: null, purchased: '2026-09-24' } )
		);
		const noDuration = unitOf(
			line( 'Milk', { macros: { kcal: 700 }, purchased: '2026-09-24' } )
		);
		expect( forecastByDay( [ tile( 7, noMacros ) ], today ) ).toEqual( [] );
		expect( forecastByDay( [ tile( 0, noDuration ) ], today ) ).toEqual(
			[]
		);
	} );
} );

describe( 'daysCovered', () => {
	const today = new Date( '2026-09-25T15:00:00' );
	const forecast = [ 1900, 1600, 1300, 1200, 900 ].map( ( kcal, i ) => ( {
		day: `2026-09-${ 26 + i }`,
		macros: { ...ZERO_MACROS, kcal },
	} ) );

	it( 'counts days from tomorrow that still get half the energy target', () => {
		expect( daysCovered( forecast, today, 2500 ) ).toBe( 3 );
	} );

	it( 'is zero without a target or when tomorrow is already short', () => {
		expect( daysCovered( forecast, today, 0 ) ).toBe( 0 );
		expect( daysCovered( forecast, today, 4000 ) ).toBe( 0 );
	} );
} );

describe( 'intakeSources', () => {
	const week = { from: '2026-09-20', to: '2026-09-26' };

	it( 'ranks by the in-range share of each span', () => {
		const eggs = unitOf(
			line( 'Eggs', { macros: { protein: 30 }, purchased: '2026-09-21' } )
		);
		const oats = unitOf(
			line( 'Oats', {
				macros: { protein: 100 },
				purchased: '2026-09-01',
			} )
		);
		const spans = eatenSpans(
			[ mark( eggs, '2026-09-21' ), mark( oats, '2026-09-20' ) ],
			byKey( eggs, oats )
		);
		const sources = intakeSources( spans, week, 'protein', 'product' );
		expect( sources.map( ( s ) => s.name ) ).toEqual( [ 'Eggs', 'Oats' ] );
		expect( sources[ 0 ]?.amount ).toBe( 30 );
		expect( sources[ 1 ]?.amount ).toBeCloseTo( 5, 6 );
	} );

	it( 'works for any nutrient', () => {
		const salty = unitOf(
			line( 'Chips', {
				macros: { salt: 2, protein: 1 },
				purchased: '2026-09-22',
			} )
		);
		const spans = eatenSpans(
			[ mark( salty, '2026-09-22' ) ],
			byKey( salty )
		);
		expect(
			intakeSources( spans, week, 'salt', 'product' )[ 0 ]?.amount
		).toBe( 2 );
	} );

	it( 'groups by the second category level, falling back to the first', () => {
		const yoghurt = unitOf(
			line( 'Vaniljyoghurt', {
				macros: { protein: 10 },
				purchased: '2026-09-22',
				categoryPath: [
					'Mejeri & Ägg',
					'Yoghurt & Fil',
					'Smaksatt yoghurt',
				],
			} )
		);
		const fil = unitOf(
			line( 'Filmjölk', {
				macros: { protein: 6 },
				purchased: '2026-09-22',
				categoryPath: [ 'Mejeri & Ägg', 'Yoghurt & Fil', 'Fil' ],
			} )
		);
		const cheese = unitOf(
			line( 'Parmesan', {
				macros: { protein: 8 },
				purchased: '2026-09-22',
				categoryPath: [ 'Ost' ],
			} )
		);
		const bars = unitOf(
			line( 'Bar', { macros: { protein: 5 }, purchased: '2026-09-22' } )
		);
		const spans = eatenSpans(
			[
				mark( yoghurt, '2026-09-22' ),
				mark( fil, '2026-09-22' ),
				mark( cheese, '2026-09-22' ),
				mark( bars, '2026-09-22' ),
			],
			byKey( yoghurt, fil, cheese, bars )
		);
		expect( intakeSources( spans, week, 'protein', 'category' ) ).toEqual( [
			{ name: 'Yoghurt & Fil', amount: 16 },
			{ name: 'Ost', amount: 8 },
			{ name: 'Uncategorised', amount: 5 },
		] );
	} );
} );

describe( 'summarizeSources', () => {
	it( 'keeps the top few and folds the rest into one row', () => {
		const summary = summarizeSources(
			[
				{ name: 'a', amount: 5 },
				{ name: 'b', amount: 3 },
				{ name: 'c', amount: 1 },
				{ name: 'd', amount: 1 },
			],
			2
		);
		expect( summary.total ).toBe( 10 );
		expect( summary.top.map( ( s ) => s.name ) ).toEqual( [ 'a', 'b' ] );
		expect( summary.rest ).toEqual( { count: 2, amount: 2 } );
	} );
} );

describe( 'countedShare', () => {
	const week = { from: '2026-09-20', to: '2026-09-26' };

	it( 'weighs eaten food by price and counts only what has nutrition', () => {
		const cheese = unitOf(
			line( 'Cheese', {
				macros: { kcal: 800 },
				price: 60,
				purchased: '2026-09-22',
			} )
		);
		const produce = unitOf(
			line( 'Tomatoes', {
				macros: null,
				price: 20,
				purchased: '2026-09-22',
			} )
		);
		const spans = eatenSpans(
			[ mark( cheese, '2026-09-22' ), mark( produce, '2026-09-22' ) ],
			byKey( cheese, produce )
		);
		expect(
			countedShare( spans, week, ( u ) => unitPrice( u, new Map() ) )
		).toEqual( {
			countedKr: 60,
			eatenKr: 80,
		} );
	} );

	it( 'takes only the in-range share of a span', () => {
		const oats = unitOf(
			line( 'Oats', {
				macros: { kcal: 1000 },
				price: 30,
				purchased: '2026-09-17',
			} )
		);
		const spans = eatenSpans(
			[ mark( oats, '2026-09-22' ) ],
			byKey( oats )
		);
		const share = countedShare( spans, week, ( u ) =>
			unitPrice( u, new Map() )
		);
		expect( share.eatenKr ).toBeCloseTo( 15, 6 );
	} );
} );

describe( 'wasteSummary', () => {
	const september = { from: '2026-09-01', to: '2026-09-30' };
	const price = ( u: PantryUnit ) => unitPrice( u, new Map() );

	it( 'charges one package of an "xN st" line, not the whole line', () => {
		const units = expandLineToUnits(
			line( 'Vaniljyoghurt', { price: 40, count: 4 } )
		);
		const summary = wasteSummary(
			[
				mark( units[ 0 ]!, '2026-09-20', { outcome: 'wasted' } ),
				mark( units[ 1 ]!, '2026-09-21', { outcome: 'wasted' } ),
			],
			byKey( ...units ),
			september,
			price
		);
		expect( summary.kr ).toBe( 20 );
		expect( summary.count ).toBe( 2 );
		expect( summary.products ).toEqual( [
			{ name: 'Vaniljyoghurt', count: 2, kr: 20 },
		] );
	} );

	it( 'leaves out finished units and anything outside the range', () => {
		const hummus = unitOf( line( 'Hummus', { price: 30 } ) );
		const bread = unitOf( line( 'Bread', { price: 25 } ) );
		const summary = wasteSummary(
			[
				mark( hummus, '2026-09-20' ),
				mark( bread, '2026-08-31', { outcome: 'wasted' } ),
			],
			byKey( hummus, bread ),
			september,
			price
		);
		expect( summary ).toEqual( { kr: 0, count: 0, products: [] } );
	} );
} );
