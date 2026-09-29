import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FetchLike, HttpResponse } from '../src/http';

/** Read a synthetic receipt-text fixture (PII-free) by filename. */
export function fixture( name: string ): string {
	return readFileSync(
		fileURLToPath( new URL( `./fixtures/${ name }`, import.meta.url ) ),
		'utf8'
	);
}

/** Build an {@link HttpResponse} with a JSON body. */
export function jsonResponse(
	body: unknown,
	{ ok = true, status = 200 }: { ok?: boolean; status?: number } = {}
): HttpResponse {
	return {
		ok,
		status,
		statusText: ok ? 'OK' : 'Error',
		json: async () => body,
		text: async () => JSON.stringify( body ),
		arrayBuffer: async () => new ArrayBuffer( 0 ),
	};
}

/** Build an {@link HttpResponse} whose `arrayBuffer()` yields `bytes`. */
export function bytesResponse(
	bytes: Uint8Array,
	{ ok = true, status = 200 }: { ok?: boolean; status?: number } = {}
): HttpResponse {
	return {
		ok,
		status,
		statusText: ok ? 'OK' : 'Error',
		json: async () => ( {} ),
		text: async () => '',
		arrayBuffer: async () =>
			bytes.buffer.slice(
				bytes.byteOffset,
				bytes.byteOffset + bytes.byteLength
			) as ArrayBuffer,
	};
}

/** Record calls made to a stub {@link FetchLike} for later assertions. */
export interface FetchCall {
	url: string;
	method?: string;
	headers?: Record< string, string >;
	body?: string;
}

/** A stub transport: returns `response` and records each call in `calls`. */
export function stubFetch( response: HttpResponse ): {
	fetch: FetchLike;
	calls: FetchCall[];
} {
	return stubFetchSequence( [ response ] );
}

/**
 * A stub transport that returns `responses` in order, one per call, and
 * repeats the last one for any call beyond the list — for exercising code
 * that pages through several responses.
 */
export function stubFetchSequence( responses: HttpResponse[] ): {
	fetch: FetchLike;
	calls: FetchCall[];
} {
	const calls: FetchCall[] = [];
	const fetch: FetchLike = async ( url, init ) => {
		calls.push( { url, ...init } );
		const response =
			responses[ Math.min( calls.length - 1, responses.length - 1 ) ];
		return response!;
	};
	return { fetch, calls };
}
