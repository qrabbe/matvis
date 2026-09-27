import { describe, expect, it } from 'bun:test';
import { energyBars, niceCeiling } from '../../src/lib/energy-chart';
import { ZERO_MACROS } from '../../src/lib/nutrition';
import type { DayIntake } from '../../src/lib/intake';

const today = new Date( '2026-09-25T15:00:00' );

function intake( day: string, marked: number, backfill = 0 ): DayIntake {
	return {
		day,
		marked: { ...ZERO_MACROS, kcal: marked },
		backfill: { ...ZERO_MACROS, kcal: backfill },
	};
}

describe( 'energyBars, day buckets', () => {
	it( 'makes one bar per day in the range, ending on today', () => {
		const range = { from: '2026-09-21', to: '2026-09-27' };
		const bars = energyBars( [], range, 'day', today );
		expect( bars ).toHaveLength( 7 );
		expect( bars[ 0 ]?.from ).toBe( '2026-09-21' );
		expect( bars.at( -1 )?.from ).toBe( '2026-09-27' );
		expect(
			bars.filter( ( b ) => b.includesToday ).map( ( b ) => b.from )
		).toEqual( [ '2026-09-25' ] );
	} );

	it( 'counts marked and backfilled intake the same way, on the day it fell', () => {
		const range = { from: '2026-09-18', to: '2026-09-25' };
		const bars = energyBars(
			[ intake( '2026-09-20', 1500, 300 ) ],
			range,
			'day',
			today
		);
		expect( bars.find( ( b ) => b.from === '2026-09-20' )?.marked ).toBe(
			1800
		);
	} );
} );

describe( 'energyBars, month buckets', () => {
	it( 'makes twelve bars, one per calendar month, averaged per elapsed day', () => {
		const range = { from: '2026-01-01', to: '2026-12-31' };
		const bars = energyBars(
			[ intake( '2026-09-01', 1400 ), intake( '2026-09-02', 700 ) ],
			range,
			'month',
			today
		);
		expect( bars ).toHaveLength( 12 );
		const september = bars.find( ( b ) => b.includesToday )!;
		expect( september.from ).toBe( '2026-09-01' );
		expect( september.to ).toBe( '2026-09-30' );
		expect( september.marked ).toBe( ( 1400 + 700 ) / 25 ); // 25 days elapsed by the 25th

		const december = bars.at( -1 )!;
		expect( december.marked ).toBe( 0 ); // hasn't happened yet
	} );
} );

describe( 'niceCeiling', () => {
	it( 'rounds up to a readable axis with about three steps', () => {
		expect( niceCeiling( 2750 ) ).toEqual( { max: 3000, step: 1000 } );
		expect( niceCeiling( 600 ) ).toEqual( { max: 600, step: 200 } );
		expect( niceCeiling( 0 ) ).toEqual( { max: 1000, step: 500 } );
	} );
} );
