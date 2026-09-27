import { describe, expect, it } from 'vitest';
import {
	needsMore,
	PRODUCT_LIST_PAGE,
} from '../../src/components/product-list';

describe( 'needsMore', () => {
	it( 'asks for a page once the window reaches past what is loaded', () => {
		const view = { startPosition: 1, perPage: PRODUCT_LIST_PAGE };
		expect( needsMore( view, PRODUCT_LIST_PAGE, 'CanLoadMore' ) ).toBe(
			false
		);
		expect( needsMore( view, PRODUCT_LIST_PAGE - 1, 'CanLoadMore' ) ).toBe(
			true
		);
	} );

	it( 'scales with the window DataViews advances to', () => {
		const view = {
			startPosition: PRODUCT_LIST_PAGE + 1,
			perPage: PRODUCT_LIST_PAGE,
		};
		expect( needsMore( view, PRODUCT_LIST_PAGE, 'CanLoadMore' ) ).toBe(
			true
		);
		expect( needsMore( view, PRODUCT_LIST_PAGE * 2, 'CanLoadMore' ) ).toBe(
			false
		);
	} );

	it( 'never asks once the query is exhausted or already loading', () => {
		const view = { startPosition: 1, perPage: PRODUCT_LIST_PAGE };
		expect( needsMore( view, 0, 'Exhausted' ) ).toBe( false );
		expect( needsMore( view, 0, 'LoadingMore' ) ).toBe( false );
		expect( needsMore( view, 0, 'LoadingFirstPage' ) ).toBe( false );
	} );
} );
