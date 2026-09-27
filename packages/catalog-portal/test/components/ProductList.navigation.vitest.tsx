import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * The installed @wordpress/dataviews list layout (the default here) never
 * calls renderItemLink — only grid does. This is what actually drives
 * navigation for the default layout, so it's asserted directly rather than
 * trusted to renderItemLink's presence.
 */
vi.mock( '@wordpress/dataviews', () => ( {
	DataViews: ( props: {
		onChangeSelection?: ( ids: string[] ) => void;
		data: { ean: string }[];
	} ) => (
		<button
			onClick={ () =>
				props.onChangeSelection?.( [ props.data[ 0 ]!.ean ] )
			}
		>
			select first row
		</button>
	),
	filterSortAndPaginate: ( data: unknown[] ) => ( {
		data,
		paginationInfo: { totalItems: data.length, totalPages: 1 },
	} ),
} ) );

const { ProductList } = await import( '../../src/components/ProductList' );

describe( 'ProductList selection', () => {
	it( 'navigates to the product page when a row is selected', () => {
		window.location.hash = '';
		render(
			<ProductList
				rows={ [
					{
						ean: '123',
						name: 'Test product',
						store: 'coop',
					},
				] }
				status="Exhausted"
				loadMore={ () => {} }
			/>
		);

		fireEvent.click( screen.getByText( 'select first row' ) );
		expect( window.location.hash ).toBe( '#/p/123?store=coop' );
	} );
} );
