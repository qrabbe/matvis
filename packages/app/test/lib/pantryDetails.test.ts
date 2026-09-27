import { describe, expect, it } from 'bun:test';
import type { ReceiptHeader, ReceiptItemDoc } from '@matvis/shared';
import {
	joinUnitsWithMarks,
	sortByPurchaseDate,
} from '../../src/lib/pantryDetails';
import { expandLineToUnits } from '../../src/lib/pantryUnits';
import type { MarkRow } from '../../src/lib/appBackendApi';
import type { PurchaseLine } from '../../src/lib/purchases';

function line( receiptId: string, purchasedAt: string ): PurchaseLine {
	const item: ReceiptItemDoc = {
		_id: `item_${ receiptId }` as ReceiptItemDoc[ '_id' ],
		_creationTime: 0,
		receiptId: receiptId as ReceiptItemDoc[ 'receiptId' ],
		lineNo: 0,
		text: 'MJÖLK',
		price: 15,
		isDiscount: false,
		gtin: '111',
		kind: 'product',
	};
	return {
		item,
		header: { _id: receiptId } as ReceiptHeader,
		day: purchasedAt.slice( 0, 10 ),
		purchasedAt: new Date( purchasedAt ),
		product: null,
		macros: null,
	};
}

function mark(
	unit: ReturnType< typeof expandLineToUnits >[ number ]
): MarkRow {
	return {
		_id: 'm1',
		_creationTime: 0,
		receiptId: unit.receiptId,
		lineNo: unit.lineNo,
		unitIndex: unit.unitIndex,
		outcome: 'finished',
		finishedAt: Date.now(),
		finishedAtHandSet: false,
		via: 'tap',
	};
}

describe( 'joinUnitsWithMarks', () => {
	it( 'pairs a marked unit with its mark and an unmarked one with null', () => {
		const [ a ] = expandLineToUnits( line( 'r1', '2026-09-01' ) );
		const [ b ] = expandLineToUnits( line( 'r2', '2026-09-02' ) );
		const states = joinUnitsWithMarks( [ a!, b! ], [ mark( a! ) ] );
		expect( states.find( ( s ) => s.unit === a )?.mark?.receiptId ).toBe(
			'r1'
		);
		expect( states.find( ( s ) => s.unit === b )?.mark ).toBeNull();
	} );
} );

describe( 'sortByPurchaseDate', () => {
	it( 'orders oldest first regardless of input order', () => {
		const [ newer ] = expandLineToUnits( line( 'r2', '2026-09-10' ) );
		const [ older ] = expandLineToUnits( line( 'r1', '2026-09-01' ) );
		const sorted = sortByPurchaseDate( [
			{ unit: newer!, mark: null },
			{ unit: older!, mark: null },
		] );
		expect( sorted.map( ( s ) => s.unit.receiptId ) ).toEqual( [
			'r1',
			'r2',
		] );
	} );
} );
