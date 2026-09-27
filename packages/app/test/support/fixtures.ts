import type { CatalogRow, ReceiptHeader, ReceiptItemDoc } from '@matvis/shared';
import {
	EMPTY_COVERAGE,
	receiptDate,
	type PurchaseLine,
} from '../../src/lib/purchases';
import { itemMacros } from '../../src/lib/nutrition';
import { dayKey } from '../../src/lib/format';
import type { PurchaseData } from '../../src/hooks/usePurchaseData';
import type { MarkRow } from '../../src/lib/appBackendApi';

/**
 * Fixtures for the DOM suites. The bun suites in `test/lib` each build their
 * own, because each one only needs the two or three fields its function reads;
 * a panel renders the whole shape, so these are shared instead.
 */

/** A receipt header. Defaults to one purchase at Stora Coop. */
export function header(
	overrides: Partial< ReceiptHeader > = {}
): ReceiptHeader {
	return {
		_id: 'receipt_1' as ReceiptHeader[ '_id' ],
		_creationTime: Date.parse( '2026-03-01T12:00:00.000Z' ),
		connectionId: 'connection_1' as ReceiptHeader[ 'connectionId' ],
		accountId: 'account_1' as ReceiptHeader[ 'accountId' ],
		externalId: 'ext-1',
		source: 'coop',
		store: { name: 'Stora Coop' },
		currency: 'SEK',
		total: 132.5,
		vat: [],
		purchasedAt: '2026-03-01T12:00:00.000Z',
		...overrides,
	} as ReceiptHeader;
}

/**
 * A receipt line. Carries no `gtin` by default, which is the real-account
 * case: nothing fills `itemGtinMap` yet, so almost every line is unmatched.
 */
export function item(
	overrides: Partial< ReceiptItemDoc > = {}
): ReceiptItemDoc {
	return {
		_id: 'item_1' as ReceiptItemDoc[ '_id' ],
		_creationTime: 0,
		receiptId: 'receipt_1' as ReceiptItemDoc[ 'receiptId' ],
		lineNo: 1,
		text: 'PESTO PEPERONICO 32,95',
		price: 32.95,
		isDiscount: false,
		...overrides,
	};
}

/**
 * A catalog row with a full nutrition block, so a line built from it produces
 * real macros rather than falling into the not-scalable bucket.
 */
export function product( overrides: Partial< CatalogRow > = {} ): CatalogRow {
	return {
		_id: 'catalog_1' as CatalogRow[ '_id' ],
		_creationTime: 0,
		ean: '7311312009203',
		name: 'Kikärtor 500 g',
		store: 'coop',
		sourceTable: 'raw_coop',
		sourceId: 'raw_1',
		netContent: { value: 500, unit: 'g' },
		food: {
			nutrition: {
				basisQuantity: 100,
				basisUnit: 'g',
				energyKcal: 200,
				proteinG: 10,
				fatG: 5,
				carbohydrateG: 30,
				sugarsG: 2,
				fiberG: 3,
				saturatedFatG: 1,
				saltG: 0.5,
			},
		},
		...overrides,
	};
}

/**
 * One joined line, the shape every panel actually reads. `day`/
 * `purchasedAt` derive from `header.purchasedAt` the same way `buildLines`
 * really computes them, unless a test overrides either directly — so
 * passing a custom `header` alone (without also repeating the date on the
 * line itself) still produces a consistent, correctly-dated fixture.
 */
export function line(
	overrides: Partial< PurchaseLine > & { item?: ReceiptItemDoc } = {}
): PurchaseLine {
	const doc = overrides.item ?? item();
	const head = overrides.header ?? header();
	const row = 'product' in overrides ? overrides.product : product();
	const purchasedAt = overrides.purchasedAt ?? receiptDate( head );
	return {
		item: doc,
		header: head,
		day: dayKey( purchasedAt ),
		purchasedAt,
		product: row ?? null,
		macros: row ? itemMacros( doc, row ) : null,
		...overrides,
	};
}

/**
 * A settled, empty purchase store: headers loaded, nothing in them. This is
 * what a freshly linked account looks like and what every panel's empty state
 * has to render from, so it is the default the panel suite overrides.
 */
export function purchaseData(
	overrides: Partial< PurchaseData > = {}
): PurchaseData {
	return {
		headers: [],
		lines: [],
		linesByReceipt: new Map(),
		itemsByReceipt: new Map(),
		coverage: EMPTY_COVERAGE,
		loadingHeaders: false,
		loadingMoreHeaders: false,
		hydration: { done: 0, total: 0 },
		loadingProducts: false,
		catalogAvailable: true,
		error: null,
		...overrides,
	};
}

let markSeq = 0;

/**
 * A finished/wasted mark row, keyed to whichever unit a test's own fixture
 * lines produced (`receiptId`/`lineNo`/`unitIndex` — see `pantryUnits.ts`).
 */
export function markRow( overrides: Partial< MarkRow > = {} ): MarkRow {
	markSeq += 1;
	return {
		_id: `mark_${ markSeq }`,
		_creationTime: 0,
		receiptId: 'receipt_1',
		lineNo: 1,
		unitIndex: 0,
		outcome: 'finished',
		finishedAt: Date.now(),
		finishedAtHandSet: false,
		via: 'tap',
		...overrides,
	};
}
