import { normalizeItemText } from '@matvis/shared';
import { MAX_MAP_ROWS_PER_TEXT } from './validators';
import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';

/**
 * A line's price counts as fitting a row's reference `price` when it's
 * within this many kronor of some small multiple of it — covers buying more
 * than one of the same line without needing `quantity` to be parsed right,
 * while staying far enough under a size step (Coop's own sizes are rarely
 * within a few öre of each other) to not blur two real products together.
 */
const PRICE_FIT_TOLERANCE = 0.05;
const MAX_QUANTITY_GUESS = 12;

function fitsPrice( linePrice: number, rowPrice: number ): boolean {
	if ( rowPrice <= 0 ) {
		return false;
	}
	for ( let q = 1; q <= MAX_QUANTITY_GUESS; q++ ) {
		if ( Math.abs( linePrice - q * rowPrice ) <= PRICE_FIT_TOLERANCE ) {
			return true;
		}
	}
	return false;
}

/**
 * The same printed text can mean different real products at different
 * prices (Coop prints "HAVREGRYN" for a 750g bag and a 1500g bag alike), so
 * a text can have more than one `itemGtinMap` row of kind `product`. This
 * picks the right one for a specific line: a row whose `price` fits the
 * line's price wins; with no priced row fitting, the generic (price-less)
 * row is the catch-all; with neither, the first row is the pre-existing
 * fallback for old text-only data. Only when several priced rows exist and
 * none fit does this leave the line unmatched rather than guessing — that's
 * the actual fix, priced ambiguity is exactly the case a blind first-row
 * pick got wrong. Callers pass only `product`-kind rows in.
 */
function pickMapRow(
	rows: Doc< 'itemGtinMap' >[],
	linePrice: number
): Doc< 'itemGtinMap' > | null {
	if ( rows.length === 0 ) {
		return null;
	}
	const priced = rows.filter( ( r ) => r.price !== undefined );
	const fit = priced.find( ( r ) => fitsPrice( linePrice, r.price! ) );
	if ( fit ) {
		return fit;
	}
	const generic = rows.find( ( r ) => r.price === undefined );
	if ( generic ) {
		return generic;
	}
	if ( priced.length > 0 ) {
		return null;
	} // ambiguous priced rows, none fit
	return rows[ 0 ];
}

export type GtinMap = Map< string, Doc< 'itemGtinMap' >[] >;

function unresolvedTexts(
	items: { text: string; isDiscount: boolean }[]
): string[] {
	const texts = new Set< string >();
	for ( const item of items ) {
		if ( item.isDiscount ) {
			continue;
		}
		const normalized = normalizeItemText( item.text );
		if ( normalized !== '' ) {
			texts.add( normalized );
		}
	}
	return [ ...texts ];
}

/**
 * Loads only the `itemGtinMap` rows a receipt's own lines could match: one
 * indexed lookup per distinct normalized text among `items`, capped per text
 * by `MAX_MAP_ROWS_PER_TEXT` — so the read cost tracks the receipt (a
 * handful of distinct texts), never the whole store's map, which can run
 * into the tens of thousands of rows as coverage grows. Read live (not
 * cached in `receiptItems`), so a row added long after a receipt was synced
 * still resolves on the very next read.
 */
export async function loadGtinMapForItems(
	ctx: QueryCtx,
	store: Doc< 'receipts' >[ 'source' ],
	items: { text: string; isDiscount: boolean }[]
): Promise< GtinMap > {
	const map: GtinMap = new Map();
	await Promise.all(
		unresolvedTexts( items ).map( async ( text ) => {
			const rows = await ctx.db
				.query( 'itemGtinMap' )
				.withIndex( 'by_store_text', ( q ) =>
					q.eq( 'store', store ).eq( 'normalizedText', text )
				)
				.take( MAX_MAP_ROWS_PER_TEXT );
			if ( rows.length > 0 ) {
				map.set( text, rows );
			}
		} )
	);
	return map;
}

export interface ResolvedMapping {
	kind: Doc< 'itemGtinMap' >[ 'kind' ];
	gtin?: string;
}

/**
 * Resolves a line's text against the map, live, into whichever kind of
 * `itemGtinMap` row it hit. `product` rows go through the price-fit logic
 * above, since a text can mean several sizes; the other kinds are plain
 * classifications a text either has or doesn't, so the first row of that
 * kind wins. A text with both a `product` row and a non-product row is not
 * expected to occur, but `product` wins the tie if it does — resolving to a
 * real catalog item is strictly more useful than a classification.
 */
export function resolveMapping(
	map: GtinMap,
	item: { text: string; price: number; isDiscount: boolean }
): ResolvedMapping | undefined {
	if ( item.isDiscount ) {
		return undefined;
	}
	const normalizedText = normalizeItemText( item.text );
	if ( normalizedText === '' ) {
		return undefined;
	}
	const rows = map.get( normalizedText ) ?? [];
	if ( rows.length === 0 ) {
		return undefined;
	}

	const productRows = rows.filter( ( r ) => r.kind === 'product' );
	const picked = pickMapRow( productRows, item.price );
	if ( picked ) {
		return { kind: 'product', gtin: picked.gtin };
	}

	const nonProduct = rows.find( ( r ) => r.kind !== 'product' );
	if ( nonProduct ) {
		return { kind: nonProduct.kind };
	}
	return undefined; // priced `product` rows exist but none fit — unresolved
}
