import { describe, expect, it } from 'bun:test';
import {
	CoopReceiptListResponse,
	listReceipts,
} from '../../../src/coop/receipts/list';
import { jsonResponse, stubFetch, stubFetchSequence } from '../../helpers';

/** A minimal Coop list row, distinguishable only by its id. */
function listRow( id: string ) {
	return { receipt_id: id };
}

describe( 'CoopReceiptListResponse', () => {
	it( 'coerces missing and null data to []', () => {
		expect( CoopReceiptListResponse.parse( {} ).data ).toEqual( [] );
		expect(
			CoopReceiptListResponse.parse( { error: 'boom', data: null } ).data
		).toEqual( [] );
	} );

	it( 'accepts JSON null for absent row fields', () => {
		const [ row ] = CoopReceiptListResponse.parse( {
			data: [ { receipt_id: 'r-1', purchase_amount: null } ],
		} ).data;
		expect( row?.purchase_amount ).toBeNull();
	} );
} );

describe( 'listReceipts', () => {
	it( 'maps Coop snake_case rows onto the store-agnostic summary', async () => {
		const { fetch, calls } = stubFetch(
			jsonResponse( {
				data: [
					{
						receipt_id: 'r-1',
						purchase_place: 'Stora Coop Location',
						purchase_amount: 41.95,
						purchased_at: '2026-01-02 12:00',
						mmkid: 'mmk-1',
					},
				],
				current_page: 1,
				total: 1,
			} )
		);
		const res = await listReceipts( fetch, 'token' );
		expect( res ).toEqual( [
			{
				id: 'r-1',
				place: 'Stora Coop Location',
				amount: 41.95,
				purchasedAt: '2026-01-02 12:00',
			},
		] );
		expect( calls[ 0 ]?.url ).toContain( 'per_page=50' );
		expect( calls[ 0 ]?.url ).toContain( 'page=1' );
	} );

	it( 'throws when the envelope carries an error field', async () => {
		const { fetch } = stubFetch(
			jsonResponse( { data: [], error: 'nope' } )
		);
		await expect( listReceipts( fetch, 'token' ) ).rejects.toThrow(
			'nope'
		);
	} );

	it( 'throws on a non-ok response', async () => {
		const { fetch } = stubFetch(
			jsonResponse( {}, { ok: false, status: 401 } )
		);
		await expect( listReceipts( fetch, 'token' ) ).rejects.toThrow(
			'listReceipts failed'
		);
	} );

	it( 'follows a full first page into a second, shorter one', async () => {
		const { fetch, calls } = stubFetchSequence( [
			jsonResponse( {
				data: Array.from( { length: 2 }, ( _, i ) =>
					listRow( `p1-${ i }` )
				),
				current_page: 1,
				total: 3,
			} ),
			jsonResponse( {
				data: [ listRow( 'p2-0' ) ],
				current_page: 2,
				total: 3,
			} ),
		] );

		const res = await listReceipts( fetch, 'token', { perPage: 2 } );

		expect( res.map( ( r ) => r.id ) ).toEqual( [
			'p1-0',
			'p1-1',
			'p2-0',
		] );
		expect( calls ).toHaveLength( 2 );
		expect( calls[ 0 ]?.url ).toContain( 'page=1' );
		expect( calls[ 1 ]?.url ).toContain( 'page=2' );
	} );

	it( 'stops at a short page even when the envelope omits total', async () => {
		const { fetch, calls } = stubFetchSequence( [
			jsonResponse( { data: [ listRow( 'only' ) ], current_page: 1 } ),
		] );

		const res = await listReceipts( fetch, 'token', { perPage: 50 } );

		expect( res.map( ( r ) => r.id ) ).toEqual( [ 'only' ] );
		expect( calls ).toHaveLength( 1 );
	} );
} );
