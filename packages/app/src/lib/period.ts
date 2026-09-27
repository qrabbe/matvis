import { dayKey, formatDayRange, parseDayKey } from './format';
import type { DateRange } from './dateRange';

export type PeriodUnit = 'week' | 'month' | 'year';

export interface Period {
	unit: PeriodUnit;
	/**
	 * Any day inside the period — the Monday for a week, the 1st for a
	 * month or year. Always a full calendar period; `periodRange` clips the
	 * end at today when it's the one currently running.
	 */
	anchor: string;
}

export const PERIOD_UNIT_LABELS: Record< PeriodUnit, string > = {
	week: 'Week',
	month: 'Month',
	year: 'Year',
};

function mondayOf( date: Date ): Date {
	const d = new Date( date );
	d.setDate( d.getDate() - ( ( d.getDay() + 6 ) % 7 ) );
	return d;
}

function calendarRange( unit: PeriodUnit, anchor: Date ): DateRange {
	if ( unit === 'week' ) {
		const from = mondayOf( anchor );
		const to = new Date( from );
		to.setDate( to.getDate() + 6 );
		return { from: dayKey( from ), to: dayKey( to ) };
	}
	if ( unit === 'month' ) {
		const from = new Date( anchor.getFullYear(), anchor.getMonth(), 1 );
		const to = new Date( anchor.getFullYear(), anchor.getMonth() + 1, 0 );
		return { from: dayKey( from ), to: dayKey( to ) };
	}
	const from = new Date( anchor.getFullYear(), 0, 1 );
	const to = new Date( anchor.getFullYear(), 11, 31 );
	return { from: dayKey( from ), to: dayKey( to ) };
}

export function currentPeriod( unit: PeriodUnit, today: Date ): Period {
	return { unit, anchor: dayKey( today ) };
}

/**
 * The period's actual data range: the full calendar span, clipped at
 * today so an in-progress week/month/year is never averaged over days
 * that haven't happened yet.
 */
export function periodRange( period: Period, today: Date ): DateRange {
	const anchor = parseDayKey( period.anchor ) ?? today;
	const range = calendarRange( period.unit, anchor );
	const todayKey = dayKey( today );
	if ( range.from > todayKey ) {
		return { from: todayKey, to: todayKey };
	}
	return { from: range.from, to: range.to > todayKey ? todayKey : range.to };
}

export function shiftPeriod( period: Period, direction: 1 | -1 ): Period {
	const anchor = parseDayKey( period.anchor );
	if ( ! anchor ) {
		return period;
	}
	if ( period.unit === 'week' ) {
		const next = new Date( anchor );
		next.setDate( next.getDate() + direction * 7 );
		return { unit: 'week', anchor: dayKey( next ) };
	}
	if ( period.unit === 'month' ) {
		const next = new Date(
			anchor.getFullYear(),
			anchor.getMonth() + direction,
			1
		);
		return { unit: 'month', anchor: dayKey( next ) };
	}
	const next = new Date( anchor.getFullYear() + direction, 0, 1 );
	return { unit: 'year', anchor: dayKey( next ) };
}

/**
 * Disables the forward arrow: there's nothing to see in a period that
 * hasn't started yet.
 */
export function isLatestPeriod( period: Period, today: Date ): boolean {
	const anchor = parseDayKey( period.anchor ) ?? today;
	return calendarRange( period.unit, anchor ).to >= dayKey( today );
}

/**
 * The nominal calendar period's name, regardless of how much of it has
 * actually happened — "September 2026" even on the 3rd.
 */
export function periodLabel( period: Period ): string {
	const anchor = parseDayKey( period.anchor );
	if ( ! anchor ) {
		return period.anchor;
	}
	if ( period.unit === 'year' ) {
		return String( anchor.getFullYear() );
	}
	if ( period.unit === 'month' ) {
		return anchor.toLocaleDateString( 'en-GB', {
			month: 'long',
			year: 'numeric',
		} );
	}
	const { from, to } = calendarRange( 'week', anchor );
	return formatDayRange( from, to );
}
