import type { MarkRow } from './app-backend-api';
import type { PantryUnit } from './pantry-units';

export interface UnitState {
	unit: PantryUnit;
	mark: MarkRow | null;
}

/**
 * Joins a group's units to their mark, if any: the one join both the
 * trip view and product Details need ("still here" vs "finished on
 * date"), so it lives here once instead of twice.
 */
export function joinUnitsWithMarks(
	units: readonly PantryUnit[],
	marks: readonly MarkRow[]
): UnitState[] {
	const markByKey = new Map(
		marks.map( ( m ) => [
			`${ m.receiptId }:${ m.lineNo }:${ m.unitIndex }`,
			m,
		] )
	);
	return units.map( ( unit ) => ( {
		unit,
		mark: markByKey.get( unit.key ) ?? null,
	} ) );
}

export function sortByPurchaseDate(
	states: readonly UnitState[]
): UnitState[] {
	return [ ...states ].sort(
		( a, b ) => a.unit.purchasedAt.getTime() - b.unit.purchasedAt.getTime()
	);
}
