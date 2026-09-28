import { dayKey, formatDayMonth, parseDayKey } from './format';
import { eachDay, type DateRange } from './date-range';
import type { DayIntake } from './intake';

export type ChartBucketUnit = 'day' | 'month';

export interface EnergyBar {
	from: string;
	to: string;
	label: string;
	marked: number;
	includesToday: boolean;
}

interface Bucket {
	from: string;
	to: string;
	label: string;
}

function monthBuckets( range: DateRange ): Bucket[] {
	const year = ( parseDayKey( range.from ) ?? new Date() ).getFullYear();
	const out: Bucket[] = [];
	for ( let month = 0; month < 12; month++ ) {
		const from = new Date( year, month, 1 );
		const to = new Date( year, month + 1, 0 );
		out.push( {
			from: dayKey( from ),
			to: dayKey( to ),
			label: from.toLocaleDateString( 'en-GB', { month: 'short' } ),
		} );
	}
	return out;
}

function dayBuckets( range: DateRange ): Bucket[] {
	return eachDay( range ).map( ( day ) => ( {
		from: day,
		to: day,
		label: formatDayMonth( day ),
	} ) );
}

/**
 * Kcal per day over the selected range: one bar per day for a week or
 * month, one bar per month (averaged per day) for a year. Real taps and
 * backfilled estimates count the same way, nothing beyond today is drawn.
 */
export function energyBars(
	intake: readonly DayIntake[],
	range: DateRange,
	unit: ChartBucketUnit,
	today: Date
): EnergyBar[] {
	const todayKey = dayKey( today );
	const intakeOn = new Map( intake.map( ( d ) => [ d.day, d ] ) );
	const buckets =
		unit === 'month' ? monthBuckets( range ) : dayBuckets( range );

	return buckets.map( ( { from, to, label } ) => {
		const days = eachDay( { from, to } );
		let marked = 0;
		let elapsed = 0;
		for ( const day of days ) {
			if ( day > todayKey ) {
				continue;
			}
			elapsed += 1;
			const entry = intakeOn.get( day );
			if ( entry ) {
				marked += entry.marked.kcal + entry.backfill.kcal;
			}
		}
		return {
			from,
			to,
			label,
			marked: elapsed > 0 ? marked / elapsed : 0,
			includesToday: from <= todayKey && todayKey <= to,
		};
	} );
}

export function niceCeiling( value: number ): { max: number; step: number } {
	if ( ! ( value > 0 ) ) {
		return { max: 1000, step: 500 };
	}
	const rough = value / 3;
	const magnitude = 10 ** Math.floor( Math.log10( rough ) );
	const step =
		[ 1, 2, 2.5, 5, 10 ]
			.map( ( m ) => m * magnitude )
			.find( ( s ) => s >= rough ) ?? 10 * magnitude;
	return { max: Math.ceil( value / step ) * step, step };
}
