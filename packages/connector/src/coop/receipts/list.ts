import type { ReceiptSummary } from '@matvis/shared';
import { z } from 'zod';
import { assertOk, type FetchLike } from '../../http';
import { apiHeaders, DEFAULT_COOP_CONFIG, type CoopConfig } from '../config';

export const CoopReceiptListRow = z.object( {
	receipt_id: z.string(),
	purchase_place: z.string().nullish(),
	purchase_amount: z.number().nullish(),
	purchased_at: z.string().nullish(),
	mmkid: z.string().nullish(),
} );
export type CoopReceiptListRow = z.infer< typeof CoopReceiptListRow >;

export const CoopReceiptListResponse = z.object( {
	data: z
		.array( CoopReceiptListRow )
		.nullish()
		.transform( ( rows ) => rows ?? [] ),
	current_page: z.number().optional(),
	total: z.number().optional(),
	error: z.string().optional(),
} );
export type CoopReceiptListResponse = z.infer< typeof CoopReceiptListResponse >;

function toSummary( row: CoopReceiptListRow ): ReceiptSummary {
	return {
		id: row.receipt_id,
		purchasedAt: row.purchased_at ?? undefined,
		place: row.purchase_place ?? undefined,
		amount: row.purchase_amount ?? undefined,
	};
}

// Coop's receipt list is paged (`per_page`/`page` in, `data`/`total` back,
// no `last_page`). A history longer than this many pages — 5000 receipts at
// the default 50/page — is treated as unexpected rather than fetched forever.
export const MAX_RECEIPT_LIST_PAGES = 100;

async function fetchReceiptListPage(
	fetchImpl: FetchLike,
	accessToken: string,
	{
		perPage,
		page,
		config,
	}: { perPage: number; page: number; config: CoopConfig }
): Promise< CoopReceiptListResponse > {
	const url = `${ config.apiBaseUrl }/kvitto/rest/receipts/v1?per_page=${ perPage }&page=${ page }`;
	const res = await fetchImpl( url, {
		method: 'GET',
		headers: apiHeaders( accessToken ),
	} );
	assertOk( res, 'listReceipts' );

	const parsed = CoopReceiptListResponse.parse( await res.json() );
	if ( parsed.error ) {
		throw new Error(
			`listReceipts: Coop returned error "${ parsed.error }"`
		);
	}
	return parsed;
}

export async function listReceipts(
	fetchImpl: FetchLike,
	accessToken: string,
	options: { perPage?: number; config?: CoopConfig } = {}
): Promise< ReceiptSummary[] > {
	const { perPage = 50, config = DEFAULT_COOP_CONFIG } = options;
	const summaries: ReceiptSummary[] = [];

	for ( let page = 1; page <= MAX_RECEIPT_LIST_PAGES; page++ ) {
		const parsed = await fetchReceiptListPage( fetchImpl, accessToken, {
			perPage,
			page,
			config,
		} );
		summaries.push( ...parsed.data.map( toSummary ) );

		const gotFullPage = parsed.data.length >= perPage;
		const belowKnownTotal =
			parsed.total === undefined || summaries.length < parsed.total;
		if ( ! gotFullPage || ! belowKnownTotal ) {
			break;
		}
	}

	return summaries;
}
