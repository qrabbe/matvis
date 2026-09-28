import type { MarkRow } from './app-backend-api';
import type { PantryUnit } from './pantry-units';

const MS_PER_DAY = 86_400_000;

export interface FinishedSpan {
	groupKey: string;
	days: number;
	/**
	 * Whether this mark counts as a teaching signal: a single tap always
	 * does, and a bulk "Mark all" only does when its date was hand-set,
	 * otherwise catching up a forgotten trip would teach a product it lasts
	 * however long it sat unmarked in the pantry.
	 */
	teaches: boolean;
}

function defaultStartedAt( unit: PantryUnit ): number {
	return unit.purchasedAt.getTime();
}

/**
 * Turns every mark into the Started to Finished span it represents, given
 * the unit it belongs to (for the default Started date when the mark never
 * set one) and the group that unit's product resolves to. A mark for a
 * unit that no longer exists, because the line was re-matched away from
 * this key or simply hasn't loaded yet, contributes nothing rather than
 * guessing.
 */
export function finishedSpans(
	marks: readonly MarkRow[],
	unitsByKey: ReadonlyMap< string, PantryUnit >,
	groupKeyOf: ( unit: PantryUnit ) => string | null
): FinishedSpan[] {
	const spans: FinishedSpan[] = [];
	for ( const mark of marks ) {
		if ( mark.outcome !== 'finished' ) {
			continue;
		}
		const key = `${ mark.receiptId }:${ mark.lineNo }:${ mark.unitIndex }`;
		const unit = unitsByKey.get( key );
		if ( ! unit ) {
			continue;
		}
		const groupKey = groupKeyOf( unit );
		if ( ! groupKey ) {
			continue;
		}

		const startedAt = mark.startedAt ?? defaultStartedAt( unit );
		const days = ( mark.finishedAt - startedAt ) / MS_PER_DAY;
		if ( ! Number.isFinite( days ) || days < 0 ) {
			continue;
		}

		spans.push( {
			groupKey,
			days,
			// A backfill mark is a played-forward estimate, not something the
			// account actually did, so it never teaches, regardless of `via` or
			// `finishedAtHandSet`.
			teaches:
				mark.source !== 'backfill' &&
				( mark.via === 'tap' || mark.finishedAtHandSet ),
		} );
	}
	return spans;
}

function median( values: readonly number[] ): number | null {
	if ( values.length === 0 ) {
		return null;
	}
	const sorted = [ ...values ].sort( ( a, b ) => a - b );
	const mid = Math.floor( sorted.length / 2 );
	return sorted.length % 2 === 0
		? ( sorted[ mid - 1 ]! + sorted[ mid ]! ) / 2
		: sorted[ mid ]!;
}

/**
 * The account's own typical duration for a product, the median
 * Started to Finished span across its teaching marks, once there are at least
 * two. One or zero teaching marks isn't a pattern yet, so callers fall
 * through to the estimate/category tiers instead of trusting a single data
 * point.
 */
export function ownTypicalDuration(
	spans: readonly FinishedSpan[],
	groupKey: string
): number | null {
	const days = spans
		.filter( ( s ) => s.groupKey === groupKey && s.teaches )
		.map( ( s ) => s.days );
	return days.length >= 2 ? median( days ) : null;
}

/**
 * The three-tier fallback in one call: the account's own pace beats a
 * backfill estimate beats a category median beats a flat default. Each
 * tier is optional so a caller that hasn't wired the later ones yet (no
 * backfill table, no category rollup) still gets a sensible number.
 */
export function resolveTypicalDuration(
	spans: readonly FinishedSpan[],
	groupKey: string,
	estimateDays: number | null | undefined,
	categoryMedianDays: number | null | undefined,
	fallbackDays = 7
): number {
	return (
		ownTypicalDuration( spans, groupKey ) ??
		estimateDays ??
		categoryMedianDays ??
		fallbackDays
	);
}
