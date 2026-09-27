import type { ReceiptHeader } from '@matvis/shared';
import type { MarkRow } from './appBackendApi';
import {
	expandLinesToUnits,
	pantryGroupKey,
	type PantryUnit,
} from './pantryUnits';
import type { PurchaseLine } from './purchases';

export type TripDotState = 'green' | 'orange' | 'red';

export interface Trip {
	receiptId: string;
	header: ReceiptHeader;
	purchasedAt: Date;
	dotState: TripDotState;
	spend: number;
	/**
	 * Pantry-eligible units only (product or produce) — the ones a dot or a
	 * "Mark all" can ever act on.
	 */
	units: PantryUnit[];
	outstandingUnits: PantryUnit[];
	finishedUnits: PantryUnit[];
	toIdentifyCount: number;
}

/**
 * Red wins over orange, and only pantry-eligible units ever count toward
 * green — a line marked "Not in catalog" can never keep a trip orange, and
 * an unidentified line always makes it red regardless of how much else on
 * the receipt is already marked.
 */
export function tripDotState(
	units: readonly PantryUnit[],
	markedKeys: ReadonlySet< string >,
	hasUnidentified: boolean
): TripDotState {
	if ( hasUnidentified ) {
		return 'red';
	}
	const allMarked = units.every( ( u ) => markedKeys.has( u.key ) );
	return allMarked ? 'green' : 'orange';
}

/**
 * One trip per receipt, in receipt order, for the date strip and the trip
 * view it opens into.
 */
export function groupTrips(
	lines: readonly PurchaseLine[],
	marks: readonly MarkRow[]
): Trip[] {
	const markedKeys = new Set(
		marks.map( ( m ) => `${ m.receiptId }:${ m.lineNo }:${ m.unitIndex }` )
	);

	const linesByReceipt = new Map< string, PurchaseLine[] >();
	for ( const line of lines ) {
		if ( line.item.isDiscount ) {
			continue;
		}
		const group = linesByReceipt.get( line.header._id );
		if ( group ) {
			group.push( line );
		} else {
			linesByReceipt.set( line.header._id, [ line ] );
		}
	}

	const trips: Trip[] = [];
	for ( const [ receiptId, receiptLines ] of linesByReceipt ) {
		const units = expandLinesToUnits( receiptLines ).filter(
			( u ) => pantryGroupKey( u ) !== null
		);
		const outstandingUnits = units.filter(
			( u ) => ! markedKeys.has( u.key )
		);
		const finishedUnits = units.filter( ( u ) => markedKeys.has( u.key ) );
		const hasUnidentified = receiptLines.some(
			( l ) => l.item.kind === undefined
		);
		const toIdentifyCount = receiptLines.filter(
			( l ) => l.item.kind === undefined
		).length;
		const spend = receiptLines.reduce(
			( sum, l ) => sum + l.item.price,
			0
		);

		trips.push( {
			receiptId,
			header: receiptLines[ 0 ]!.header,
			purchasedAt: receiptLines[ 0 ]!.purchasedAt,
			dotState: tripDotState( units, markedKeys, hasUnidentified ),
			spend,
			units,
			outstandingUnits,
			finishedUnits,
			toIdentifyCount,
		} );
	}

	return trips.sort(
		( a, b ) => b.purchasedAt.getTime() - a.purchasedAt.getTime()
	);
}
