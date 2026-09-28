import { dayKey } from './format';
import {
	eachDay,
	rangeLengthDays,
	shiftDays,
	type DateRange,
} from './date-range';
import { addMacros, scaleMacros, ZERO_MACROS, type Macros } from './nutrition';
import { unitMacros, type PantryUnit } from './pantry-units';
import type { PantryTile } from './pantry';
import type { MarkRow } from './app-backend-api';

export interface DayMacros {
	day: string;
	macros: Macros;
}

export interface DayIntake {
	day: string;
	marked: Macros;
	backfill: Macros;
}

export interface EatenSpan {
	unit: PantryUnit;
	/** Started to Finished, inclusive. The unit's macros spread evenly over them. */
	days: string[];
	fromBackfill: boolean;
}

function unitKeyOf(
	m: Pick< MarkRow, 'receiptId' | 'lineNo' | 'unitIndex' >
): string {
	return `${ m.receiptId }:${ m.lineNo }:${ m.unitIndex }`;
}

function byDay( a: { day: string }, b: { day: string } ): number {
	return a.day.localeCompare( b.day );
}

function isInRange( day: string, range: DateRange ): boolean {
	return day >= range.from && day <= range.to;
}

function shareInRange( days: readonly string[], range: DateRange ): number {
	let inside = 0;
	for ( const day of days ) {
		if ( isInRange( day, range ) ) {
			inside += 1;
		}
	}
	return inside / days.length;
}

/**
 * A mark whose unit is not loaded (stale, or receipts still hydrating) is
 * skipped rather than guessed at.
 */
export function eatenSpans(
	marks: readonly MarkRow[],
	unitsByKey: ReadonlyMap< string, PantryUnit >
): EatenSpan[] {
	const spans: EatenSpan[] = [];
	for ( const mark of marks ) {
		if ( mark.outcome !== 'finished' ) {
			continue;
		}
		const unit = unitsByKey.get( unitKeyOf( mark ) );
		if ( ! unit ) {
			continue;
		}
		const startedAt = mark.startedAt ?? unit.purchasedAt.getTime();
		const days = eachDay( {
			from: dayKey( new Date( startedAt ) ),
			to: dayKey( new Date( mark.finishedAt ) ),
		} );
		if ( days.length === 0 ) {
			continue;
		}
		spans.push( { unit, days, fromBackfill: mark.source === 'backfill' } );
	}
	return spans;
}

/** A unit without usable nutrition adds nothing, never a confident zero. */
export function intakeByDay( spans: readonly EatenSpan[] ): DayIntake[] {
	const days = new Map< string, DayIntake >();
	for ( const span of spans ) {
		const macros = unitMacros( span.unit );
		if ( ! macros ) {
			continue;
		}
		const share = scaleMacros( macros, 1 / span.days.length );
		for ( const day of span.days ) {
			const entry = days.get( day ) ?? {
				day,
				marked: ZERO_MACROS,
				backfill: ZERO_MACROS,
			};
			if ( span.fromBackfill ) {
				entry.backfill = addMacros( entry.backfill, share );
			} else {
				entry.marked = addMacros( entry.marked, share );
			}
			days.set( day, entry );
		}
	}
	return [ ...days.values() ].sort( byDay );
}

export function averagePerDay(
	days: readonly DayIntake[],
	range: DateRange
): Macros {
	let total = ZERO_MACROS;
	for ( const d of days ) {
		if ( ! isInRange( d.day, range ) ) {
			continue;
		}
		total = addMacros( total, addMacros( d.marked, d.backfill ) );
	}
	return scaleMacros( total, 1 / rangeLengthDays( range ) );
}

export function lastBackfillDay( days: readonly DayIntake[] ): string | null {
	for ( let i = days.length - 1; i >= 0; i-- ) {
		if ( days[ i ]!.backfill.kcal > 0 ) {
			return days[ i ]!.day;
		}
	}
	return null;
}

type ForecastTile = Pick<
	PantryTile,
	'outstandingUnits' | 'typicalDurationDays'
>;

interface ExpectedFinish {
	macros: Macros;
	purchased: string;
	expected: string;
}

function expectedFinishes( tiles: readonly ForecastTile[] ): ExpectedFinish[] {
	const out: ExpectedFinish[] = [];
	for ( const { outstandingUnits, typicalDurationDays } of tiles ) {
		if (
			! Number.isFinite( typicalDurationDays ) ||
			typicalDurationDays <= 0
		) {
			continue;
		}
		for ( const unit of outstandingUnits ) {
			const macros = unitMacros( unit );
			if ( ! macros ) {
				continue;
			}
			const purchased = dayKey( unit.purchasedAt );
			const expected = shiftDays(
				purchased,
				Math.round( typicalDurationDays )
			);
			out.push( { macros, purchased, expected } );
		}
	}
	return out;
}

/**
 * Each unit at home is expected to finish its typical duration after
 * purchase and will then be counted spread from its purchase day, like any
 * tap. The forecast is only the part of that spread after today: the rest
 * will fill in days that are already drawn. A unit already past its usual
 * time has no expected finish left, so it is left out rather than piled onto
 * tomorrow.
 */
export function forecastByDay(
	tiles: readonly ForecastTile[],
	today: Date
): DayMacros[] {
	const todayKey = dayKey( today );
	const days = new Map< string, Macros >();

	for ( const { macros, purchased, expected } of expectedFinishes( tiles ) ) {
		if ( expected <= todayKey ) {
			continue;
		}
		const span = eachDay( { from: purchased, to: expected } );
		const share = scaleMacros( macros, 1 / span.length );
		for ( const day of span ) {
			if ( day <= todayKey ) {
				continue;
			}
			days.set( day, addMacros( days.get( day ) ?? ZERO_MACROS, share ) );
		}
	}

	return [ ...days ]
		.map( ( [ day, macros ] ) => ( { day, macros } ) )
		.sort( byDay );
}

export function unitsPastDue(
	tiles: readonly ForecastTile[],
	today: Date
): number {
	const todayKey = dayKey( today );
	return expectedFinishes( tiles ).filter( ( f ) => f.expected <= todayKey )
		.length;
}

const COVERED_SHARE_OF_TARGET = 0.5;

/**
 * How many days from tomorrow what's at home still supplies at least half
 * the daily energy target.
 */
export function daysCovered(
	forecast: readonly DayMacros[],
	today: Date,
	dailyKcal: number
): number {
	if ( ! ( dailyKcal > 0 ) ) {
		return 0;
	}
	const kcalByDay = new Map(
		forecast.map( ( d ) => [ d.day, d.macros.kcal ] )
	);
	let day = shiftDays( dayKey( today ), 1 );
	let count = 0;
	while (
		( kcalByDay.get( day ) ?? 0 ) >=
		dailyKcal * COVERED_SHARE_OF_TARGET
	) {
		count += 1;
		day = shiftDays( day, 1 );
	}
	return count;
}

export type SourceGrouping = 'product' | 'category';

export interface IntakeSource {
	name: string;
	amount: number;
}

function productName( unit: PantryUnit ): string {
	return unit.line.product?.name ?? unit.line.item.text;
}

/**
 * Coop's top level partly sorts by storage ("Skafferi", "Frys"), so the
 * second level is the first that reliably says what the food is.
 */
function categoryName( unit: PantryUnit ): string {
	const path = unit.line.product?.categoryPath;
	return path?.[ 1 ] ?? path?.[ 0 ] ?? 'Uncategorised';
}

/**
 * Each unit counts with the share of its span that falls in the range, the
 * same share the targets card counts.
 */
export function intakeSources(
	spans: readonly EatenSpan[],
	range: DateRange,
	macro: keyof Macros,
	grouping: SourceGrouping
): IntakeSource[] {
	const amounts = new Map< string, number >();
	for ( const span of spans ) {
		const macros = unitMacros( span.unit );
		if ( ! macros ) {
			continue;
		}
		const amount = macros[ macro ] * shareInRange( span.days, range );
		if ( ! ( amount > 0 ) ) {
			continue;
		}
		const name =
			grouping === 'category'
				? categoryName( span.unit )
				: productName( span.unit );
		amounts.set( name, ( amounts.get( name ) ?? 0 ) + amount );
	}
	return [ ...amounts ]
		.map( ( [ name, amount ] ) => ( { name, amount } ) )
		.sort( ( a, b ) => b.amount - a.amount );
}

export interface SourceSummary {
	total: number;
	top: IntakeSource[];
	rest: { count: number; amount: number };
}

export function summarizeSources(
	sources: readonly IntakeSource[],
	limit: number
): SourceSummary {
	const top = sources.slice( 0, limit );
	const others = sources.slice( limit );
	const sum = ( list: readonly IntakeSource[] ) =>
		list.reduce( ( total, s ) => total + s.amount, 0 );
	return {
		total: sum( sources ),
		top,
		rest: { count: others.length, amount: sum( others ) },
	};
}

export interface CountedShare {
	countedKr: number;
	eatenKr: number;
}

/** In kronor, so a free bag and a kilo of cheese do not weigh the same. */
export function countedShare(
	spans: readonly EatenSpan[],
	range: DateRange,
	priceOf: ( unit: PantryUnit ) => number
): CountedShare {
	let countedKr = 0;
	let eatenKr = 0;
	for ( const span of spans ) {
		const kr = priceOf( span.unit ) * shareInRange( span.days, range );
		eatenKr += kr;
		if ( unitMacros( span.unit ) ) {
			countedKr += kr;
		}
	}
	return { countedKr, eatenKr };
}

interface WastedProduct {
	name: string;
	count: number;
	kr: number;
}

export interface WasteSummary {
	kr: number;
	count: number;
	products: WastedProduct[];
}

export function wasteSummary(
	marks: readonly MarkRow[],
	unitsByKey: ReadonlyMap< string, PantryUnit >,
	range: DateRange,
	priceOf: ( unit: PantryUnit ) => number
): WasteSummary {
	const products = new Map< string, WastedProduct >();
	let kr = 0;
	let count = 0;

	for ( const mark of marks ) {
		if ( mark.outcome !== 'wasted' ) {
			continue;
		}
		if ( ! isInRange( dayKey( new Date( mark.finishedAt ) ), range ) ) {
			continue;
		}
		const unit = unitsByKey.get( unitKeyOf( mark ) );
		if ( ! unit ) {
			continue;
		}

		const price = priceOf( unit );
		const name = productName( unit );
		const product = products.get( name ) ?? { name, count: 0, kr: 0 };
		product.count += 1;
		product.kr += price;
		products.set( name, product );
		kr += price;
		count += 1;
	}

	return {
		kr,
		count,
		products: [ ...products.values() ].sort( ( a, b ) => b.kr - a.kr ),
	};
}
