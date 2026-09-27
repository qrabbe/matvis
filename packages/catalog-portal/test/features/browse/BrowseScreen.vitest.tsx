import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * The browsing screens: a chain's front page, a category with children, a
 * leaf, and the "all products" address for a branch. Convex and DataViews
 * are stubbed out — what is worth asserting here is which address each row
 * links to, and that a leaf shows products while a branch-with-children
 * shows a child list.
 */

const backend = vi.hoisted( () => ( {
	category: null as unknown,
	categoryLevel: [] as unknown[],
	frontProducts: [] as unknown[],
} ) );

vi.mock( 'convex/react', () => ( {
	useQuery: ( _reference: unknown, args: unknown ) => {
		if ( args === 'skip' ) {
			return undefined;
		}
		if ( args && typeof args === 'object' && 'slugPath' in args ) {
			return backend.category;
		}
		if ( args && typeof args === 'object' && 'paginationOpts' in args ) {
			return {
				page: backend.frontProducts,
				isDone: true,
				continueCursor: '',
			};
		}
		return backend.categoryLevel;
	},
	usePaginatedQuery: () => ( {
		results: [],
		status: 'Exhausted',
		loadMore: () => {},
	} ),
} ) );

vi.mock( '../../../src/components/ProductList', () => ( {
	ProductList: ( { rows }: { rows: unknown[] } ) => (
		<div data-testid="product-list">{ rows.length } products</div>
	),
	PRODUCT_LIST_PAGE: 48,
} ) );

const { ancestorsFor, BrowseScreen } =
	await import( '../../../src/features/browse/BrowseScreen' );

describe( 'ancestorsFor', () => {
	it( "stops at the chain for a top-level category's parent", () => {
		const { ancestors, parent } = ancestorsFor( 'coop', 'mejeri-agg', [
			'Mejeri & Ägg',
		] );
		expect( ancestors ).toEqual( [ { name: 'Coop', path: '/' } ] );
		expect( parent ).toEqual( { name: 'Coop', path: '/' } );
	} );

	it( 'carries every ancestor for a leaf several levels deep', () => {
		const { ancestors, parent } = ancestorsFor(
			'coop',
			'mejeri-agg/mjolk/laktosfri-mjolk',
			[ 'Mejeri & Ägg', 'Mjölk', 'Laktosfri mjölk' ]
		);
		expect( ancestors ).toEqual( [
			{ name: 'Coop', path: '/' },
			{ name: 'Mejeri & Ägg', path: '/c/coop/mejeri-agg' },
			{ name: 'Mjölk', path: '/c/coop/mejeri-agg/mjolk' },
		] );
		expect( parent ).toEqual( {
			name: 'Mjölk',
			path: '/c/coop/mejeri-agg/mjolk',
		} );
	} );
} );

describe( "a chain's front page", () => {
	it( 'shows the category list collapsed above the default products', () => {
		backend.categoryLevel = [
			{
				slug: 'mejeri-agg',
				name: 'Mejeri & Ägg',
				count: 1615,
				hasChildren: true,
			},
		];
		backend.frontProducts = [
			{ ean: '111', name: 'Filmjölk', store: 'coop' },
		];

		render( <BrowseScreen store="coop" slugPath="" showAll={ false } /> );

		expect( screen.getByText( 'Browse by category' ) ).toBeInTheDocument();
		expect( screen.getByTestId( 'product-list' ) ).toHaveTextContent(
			'1 products'
		);
		expect(
			screen.queryByRole( 'link', { name: /Mejeri & Ägg/ } )
		).not.toBeInTheDocument();
	} );

	it( 'links each row to its own category address once expanded', () => {
		backend.categoryLevel = [
			{
				slug: 'mejeri-agg',
				name: 'Mejeri & Ägg',
				count: 1615,
				hasChildren: true,
			},
			{ slug: 'other', name: 'Other', count: 12, hasChildren: false },
		];
		backend.frontProducts = [];

		render( <BrowseScreen store="coop" slugPath="" showAll={ false } /> );
		fireEvent.click( screen.getByText( 'Browse by category' ) );

		expect(
			screen.getByRole( 'link', { name: /Mejeri & Ägg/ } )
		).toHaveAttribute( 'href', '#/c/coop/mejeri-agg' );
		expect( screen.getByRole( 'link', { name: /Other/ } ) ).toHaveAttribute(
			'href',
			'#/c/coop/other'
		);
	} );
} );

describe( 'a category with children', () => {
	it( 'shows an all-products row and its children, and a back link to the chain', () => {
		backend.category = {
			name: 'Mejeri & Ägg',
			count: 1615,
			hasChildren: true,
			path: [ 'Mejeri & Ägg' ],
			categoryKey: 'mejeri \u0001',
		};
		backend.categoryLevel = [
			{
				slug: 'mejeri-agg/mjolk',
				name: 'Mjölk',
				count: 195,
				hasChildren: true,
			},
		];

		render(
			<BrowseScreen
				store="coop"
				slugPath="mejeri-agg"
				showAll={ false }
			/>
		);

		expect(
			screen.getByRole( 'link', { name: /All .*products/ } )
		).toHaveAttribute( 'href', '#/c/coop/mejeri-agg/all' );
		expect( screen.getByRole( 'link', { name: /Mjölk/ } ) ).toHaveAttribute(
			'href',
			'#/c/coop/mejeri-agg/mjolk'
		);
		for ( const link of screen.getAllByRole( 'link', { name: 'Coop' } ) ) {
			expect( link ).toHaveAttribute( 'href', '#/' );
		}
		expect( screen.queryByTestId( 'product-list' ) ).toBeNull();
	} );
} );

describe( 'a leaf', () => {
	it( 'shows products straight away, with no child list', () => {
		backend.category = {
			name: 'Laktosfri mjölk',
			count: 48,
			hasChildren: false,
			path: [ 'Mejeri & Ägg', 'Mjölk', 'Laktosfri mjölk' ],
			categoryKey: 'leaf-key',
		};

		render(
			<BrowseScreen
				store="coop"
				slugPath="mejeri-agg/mjolk/laktosfri-mjolk"
				showAll={ false }
			/>
		);

		expect( screen.getByTestId( 'product-list' ) ).toBeInTheDocument();
		expect( screen.queryByRole( 'link', { name: /All \d/ } ) ).toBeNull();
		for ( const link of screen.getAllByRole( 'link', { name: 'Mjölk' } ) ) {
			expect( link ).toHaveAttribute(
				'href',
				'#/c/coop/mejeri-agg/mjolk'
			);
		}
	} );
} );

describe( 'a branch\'s "all products" address', () => {
	it( 'shows products and its back link returns to the category itself', () => {
		backend.category = {
			name: 'Mejeri & Ägg',
			count: 1615,
			hasChildren: true,
			path: [ 'Mejeri & Ägg' ],
			categoryKey: 'mejeri \u0001',
		};

		render( <BrowseScreen store="coop" slugPath="mejeri-agg" showAll /> );

		expect( screen.getByTestId( 'product-list' ) ).toBeInTheDocument();
		expect(
			screen.getByRole( 'link', { name: 'Mejeri & Ägg' } )
		).toHaveAttribute( 'href', '#/c/coop/mejeri-agg' );
	} );
} );
