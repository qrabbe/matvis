import { normalizeItemText, type ItemMappingKind } from '@matvis/shared';
import { scaleMacros, type Macros } from './nutrition';
import type { PurchaseLine } from './purchases';
import { lineDiscountKey, type LineDiscounts } from './receipt-lines';

/**
 * One pantry-trackable package or weighed lot, expanded from a single
 * receipt line. `key` is the whole identity a mark points at, stable
 * across a re-parse that only enriches quantity/unit and across the line
 * being re-matched to a different product, since neither changes
 * `receiptId`, `lineNo` or `unitIndex`.
 */
export interface PantryUnit {
	key: string;
	receiptId: string;
	lineNo: number;
	unitIndex: number;
	line: PurchaseLine;
	/**
	 * 1 for a unit expanded from an "xN STK" count line (each is its own
	 * package) or a plain single package. The weighed amount otherwise.
	 */
	quantity: number;
	/**
	 * The weight/volume unit of a loose or weighed lot ('kg', 'ml', …),
	 * null for anything counted in whole packages.
	 */
	weightUnit: string | null;
	purchasedAt: Date;
}

function unitKey(
	receiptId: string,
	lineNo: number,
	unitIndex: number
): string {
	return `${ receiptId }:${ lineNo }:${ unitIndex }`;
}

/**
 * "x5 STK" on the receipt means five separate packages that happened to
 * scan as one line. A "9-pack" product never carries a count line at all
 * (Coop scans the whole box as one priced line), so it is one package.
 */
function packageCount( item: PurchaseLine[ 'item' ] ): number {
	const { quantity, unit } = item;
	return unit === 'st' &&
		quantity !== undefined &&
		Number.isInteger( quantity ) &&
		quantity > 1
		? quantity
		: 1;
}

export function expandLineToUnits( line: PurchaseLine ): PantryUnit[] {
	const { quantity, unit } = line.item;
	const receiptId = line.header._id;
	const lineNo = line.item.lineNo;
	const count = packageCount( line.item );

	if ( count > 1 ) {
		return Array.from( { length: count }, ( _, unitIndex ) => ( {
			key: unitKey( receiptId, lineNo, unitIndex ),
			receiptId,
			lineNo,
			unitIndex,
			line,
			quantity: 1,
			weightUnit: null,
			purchasedAt: line.purchasedAt,
		} ) );
	}

	const weighed = unit !== undefined && unit !== 'st';
	return [
		{
			key: unitKey( receiptId, lineNo, 0 ),
			receiptId,
			lineNo,
			unitIndex: 0,
			line,
			quantity: quantity ?? 1,
			weightUnit: weighed ? unit! : null,
			purchasedAt: line.purchasedAt,
		},
	];
}

export function expandLinesToUnits(
	lines: readonly PurchaseLine[]
): PantryUnit[] {
	const units: PantryUnit[] = [];
	for ( const line of lines ) {
		if ( line.item.isDiscount ) {
			continue;
		}
		units.push( ...expandLineToUnits( line ) );
	}
	return units;
}

/**
 * Which tile a unit belongs to, and whether it belongs in the pantry at
 * all. A `product` groups by `gtin`, so the same product bought under two
 * slightly different printed texts is still one tile. `produce` has no
 * `gtin`, so it groups by its own normalized text instead: two different
 * loose vegetables are two different tiles, one loose vegetable bought
 * twice is one. `notFood`, `notInCatalog` and unidentified lines are never
 * tiles: the first two are classified enough to hide, the last needs
 * identifying first.
 */
export function pantryGroupKey( unit: PantryUnit ): string | null {
	const { kind, gtin, text } = unit.line.item;
	if ( kind === 'product' && gtin ) {
		return `product:${ gtin }`;
	}
	if ( kind === 'produce' ) {
		return `produce:${ normalizeItemText( text ) }`;
	}
	return null;
}

/**
 * A unit's own share of its line's macros: the whole line's macros when
 * it's a weighed lot or a plain single package (both are already one
 * unit), or an even split across the `xN st` count a line expanded into.
 * Never assumes, returns `null` right through from a line with no usable
 * nutrition rather than reporting a confident zero.
 */
export function unitMacros( unit: PantryUnit ): Macros | null {
	const macros = unit.line.macros;
	if ( ! macros ) {
		return null;
	}
	const count = packageCount( unit.line.item );
	return count > 1 ? scaleMacros( macros, 1 / count ) : macros;
}

export function unitPrice(
	unit: PantryUnit,
	discounts: LineDiscounts
): number {
	const discount =
		discounts.get( lineDiscountKey( unit.receiptId, unit.lineNo ) ) ?? 0;
	return ( unit.line.item.price + discount ) / packageCount( unit.line.item );
}

export function unitKindLabel( kind: ItemMappingKind | undefined ): string {
	switch ( kind ) {
		case 'product':
			return 'Identified';
		case 'produce':
			return 'Loose produce';
		case 'notFood':
			return 'Not food';
		case 'notInCatalog':
			return 'Not in catalog';
		default:
			return 'Unidentified';
	}
}
