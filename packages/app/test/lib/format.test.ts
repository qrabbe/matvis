import { describe, expect, it } from 'bun:test';
import {
	formatDate,
	formatDayMonth,
	formatDayRange,
	formatNumber,
	isoWeekLabel,
} from '../../src/lib/format';

const nbsp = ' ';

describe( 'formatDate', () => {
	it( 'writes dd.mm.yyyy in local time', () => {
		expect( formatDate( new Date( '2026-09-04T23:30:00' ) ) ).toBe(
			'04.09.2026'
		);
	} );
} );

describe( 'formatDayMonth', () => {
	it( 'writes dd.mm for a day key, and leaves a bad key alone', () => {
		expect( formatDayMonth( '2026-10-01' ) ).toBe( '01.10' );
		expect( formatDayMonth( 'soon' ) ).toBe( 'soon' );
	} );
} );

describe( 'formatNumber', () => {
	it( 'keeps one decimal below ten, with a decimal comma', () => {
		expect( formatNumber( 1.46 ) ).toBe( '1,5' );
		expect( formatNumber( 6 ) ).toBe( '6' );
	} );

	it( 'rounds larger values and groups thousands', () => {
		expect( formatNumber( 34.4 ) ).toBe( '34' );
		expect( formatNumber( 2500 ) ).toBe( `2${ nbsp }500` );
	} );
} );

describe( 'formatDayRange', () => {
	it( 'names the year once when both ends share it', () => {
		expect( formatDayRange( '2026-09-25', '2026-10-01' ) ).toBe(
			'25.09 – 01.10.2026'
		);
	} );

	it( 'names both years across new year', () => {
		expect( formatDayRange( '2025-12-29', '2026-01-04' ) ).toBe(
			'29.12.2025 – 04.01.2026'
		);
	} );
} );

describe( 'isoWeekLabel', () => {
	it( 'labels a known ISO week correctly', () => {
		expect( isoWeekLabel( new Date( 2026, 8, 25 ) ) ).toBe( 'Week 39' );
	} );

	it( 'rolls over at a week boundary, Monday starting a new week', () => {
		expect( isoWeekLabel( new Date( 2026, 8, 20 ) ) ).toBe( 'Week 38' );
		expect( isoWeekLabel( new Date( 2026, 8, 21 ) ) ).toBe( 'Week 39' );
	} );
} );
