import {
	expandLinesToUnits,
	pantryGroupKey,
	type PantryUnit,
} from './pantryUnits';
import type { PurchaseLine } from './purchases';

const MS_PER_DAY = 86_400_000;

export interface DurationEstimate {
	daysToFinish: number;
	maxDaysFromPurchase?: number;
}

export interface BackfillMark {
	receiptId: string;
	lineNo: number;
	unitIndex: number;
	startedAt: number;
	finishedAt: number;
}

/**
 * The one-time backfill's rule: every unit gets marked finished — nothing
 * is left outstanding. Each *purchase* (units sharing the exact same
 * purchase timestamp — a receipt's "x3 STK" line, or several single lines
 * from the same trip) is worked through one unit at a time rather than all
 * at once: the first starts the moment it's bought, and each next one
 * starts only when the previous is estimated finished. A purchase on a
 * different day starts its own fresh chain — this never looks at any other
 * purchase of the same product, so there's no backlog to build up across a
 * long buying history. A unit whose natural finish would land in the
 * future (bought too recently to be due by `trackingStartMs`) is finished
 * right at `trackingStartMs` instead — this is a one-time reset, not a
 * prediction, so nothing is left half-tracked. This rule exists only for
 * this one-time simulation; the live app never auto-finishes anything.
 */
export function simulateGroupBackfill(
	units: readonly PantryUnit[],
	estimate: DurationEstimate,
	trackingStartMs: number
): BackfillMark[] {
	const durationDays = Math.min(
		estimate.daysToFinish,
		estimate.maxDaysFromPurchase ?? Infinity
	);
	const durationMs = durationDays * MS_PER_DAY;

	const byPurchase = new Map< number, PantryUnit[] >();
	for ( const unit of units ) {
		const ts = unit.purchasedAt.getTime();
		const group = byPurchase.get( ts );
		if ( group ) {
			group.push( unit );
		} else {
			byPurchase.set( ts, [ unit ] );
		}
	}

	const marks: BackfillMark[] = [];

	for ( const purchaseUnits of byPurchase.values() ) {
		const ordered = [ ...purchaseUnits ].sort(
			( a, b ) => a.lineNo - b.lineNo || a.unitIndex - b.unitIndex
		);
		// Chained off the *natural* (uncapped) finish, so units later in a big
		// same-day purchase keep staggering even once earlier ones have been
		// capped at trackingStartMs — only the recorded dates are capped.
		let naturalStart = ordered[ 0 ]!.purchasedAt.getTime();
		for ( const unit of ordered ) {
			const naturalFinish = naturalStart + durationMs;
			const finishedAt = Math.min( naturalFinish, trackingStartMs );
			const startedAt = Math.min( naturalStart, finishedAt );
			marks.push( {
				receiptId: unit.receiptId,
				lineNo: unit.lineNo,
				unitIndex: unit.unitIndex,
				startedAt,
				finishedAt,
			} );
			naturalStart = naturalFinish;
		}
	}

	return marks;
}

/**
 * Runs every group in one receipt history through {@link
 * simulateGroupBackfill}. `estimates` is keyed by `pantryGroupKey` — a
 * group with no estimate falls back to `defaultDurationDays` (the same
 * flat default `durations.ts` uses at the bottom of its own fallback
 * chain), and a line with no group key at all (still unidentified, or not
 * classified as food) gets its own one-unit group under the same flat
 * default, so identification status never leaves it out of the reset.
 */
export function simulateBackfill(
	lines: readonly PurchaseLine[],
	estimates: ReadonlyMap< string, DurationEstimate >,
	trackingStartMs: number,
	defaultDurationDays = 7
): BackfillMark[] {
	const units = expandLinesToUnits( lines );
	const groups = new Map< string, PantryUnit[] >();
	for ( const unit of units ) {
		const key = pantryGroupKey( unit ) ?? `unkeyed:${ unit.key }`;
		const group = groups.get( key );
		if ( group ) {
			group.push( unit );
		} else {
			groups.set( key, [ unit ] );
		}
	}

	const marks: BackfillMark[] = [];
	for ( const [ groupKey, groupUnits ] of groups ) {
		const estimate = estimates.get( groupKey ) ?? {
			daysToFinish: defaultDurationDays,
		};
		marks.push(
			...simulateGroupBackfill( groupUnits, estimate, trackingStartMs )
		);
	}
	return marks;
}
