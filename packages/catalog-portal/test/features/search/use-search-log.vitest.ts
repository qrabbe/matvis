import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSearchLog } from '../../../src/features/search/use-search-log';

const backend = vi.hoisted( () => ( {
	calls: [] as { term: string; results: number }[],
} ) );

vi.mock( 'convex/react', () => ( {
	useMutation:
		() =>
		async ( args: { term: string; results: number; visitor: string } ) => {
			backend.calls.push( { term: args.term, results: args.results } );
		},
} ) );

vi.mock( '../../../src/lib/visitor', () => ( {
	visitorId: () => 'visitor-1',
} ) );

beforeEach( () => {
	backend.calls = [];
} );

describe( 'useSearchLog', () => {
	it( 'logs once a settled term has an arrived page', () => {
		const { rerender } = renderHook(
			( { term, status, count } ) => useSearchLog( term, status, count ),
			{
				initialProps: {
					term: 'mjölk',
					status: 'LoadingFirstPage',
					count: 0,
				},
			}
		);
		expect( backend.calls ).toEqual( [] );

		rerender( { term: 'mjölk', status: 'CanLoadMore', count: 6 } );
		expect( backend.calls ).toEqual( [ { term: 'mjölk', results: 6 } ] );
	} );

	it( 'never logs the empty term', () => {
		renderHook(
			( { term, status, count } ) => useSearchLog( term, status, count ),
			{
				initialProps: { term: '', status: 'Exhausted', count: 0 },
			}
		);
		expect( backend.calls ).toEqual( [] );
	} );

	it( 'logs once per settled term, not once per page loaded after it', () => {
		const { rerender } = renderHook(
			( { term, status, count } ) => useSearchLog( term, status, count ),
			{
				initialProps: {
					term: 'mjölk',
					status: 'CanLoadMore',
					count: 48,
				},
			}
		);
		expect( backend.calls ).toHaveLength( 1 );

		rerender( { term: 'mjölk', status: 'CanLoadMore', count: 96 } );
		expect( backend.calls ).toHaveLength( 1 );
	} );
} );
