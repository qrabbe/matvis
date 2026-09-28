import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { purchaseData } from './support/fixtures';
import type { PurchaseData } from '../src/hooks/use-purchase-data';

const store = vi.hoisted( () => ( {
	data: null as PurchaseData | null,
	seen: [] as ( string | null )[],
} ) );

vi.mock( '../src/hooks/use-purchase-data', () => ( {
	usePurchaseData: ( token: string | null ) => {
		store.seen.push( token );
		return store.data;
	},
} ) );

vi.mock( 'convex/react', () => ( {
	useQuery: () => [],
	useConvex: () => ( { query: async () => null } ),
	ConvexReactClient: class {
		watchQuery() {
			return {
				localQueryResult: () => undefined,
				onUpdate: () => () => {},
			};
		}
	},
} ) );

const { App } = await import( '../src/App' );

beforeEach( () => {
	localStorage.clear();
	store.data = purchaseData();
	store.seen = [];
} );

afterEach( () => localStorage.clear() );

describe( 'the token gate', () => {
	it( 'is what an unconfigured browser sees, and it points at the portal', () => {
		render( <App /> );

		expect(
			screen.getByText( 'Connect your receipts' )
		).toBeInTheDocument();
		expect(
			screen.getByRole( 'link', { name: 'connector portal' } )
		).toHaveAttribute( 'href', '../connector/' );
		expect( store.seen ).toEqual( [ null ] );
	} );

	it( 'refuses an empty token and accepts anything else', async () => {
		const user = userEvent.setup();
		render( <App /> );

		const submit = screen.getByRole( 'button', { name: 'Use this token' } );
		expect( submit ).toHaveAttribute( 'aria-disabled', 'true' );

		await user.type(
			screen.getByLabelText( 'Account API token' ),
			'mv_test_token'
		);
		expect( submit ).not.toHaveAttribute( 'aria-disabled', 'true' );

		await user.click( submit );
		await waitFor( () =>
			expect( screen.queryByText( 'Connect your receipts' ) ).toBeNull()
		);
		expect( store.seen.at( -1 ) ).toBe( 'mv_test_token' );
	} );

	it( 'skips straight past the gate when a token is already stored', () => {
		localStorage.setItem( 'matvis.app.apiToken', 'mv_stored' );

		render( <App /> );

		expect( screen.queryByText( 'Connect your receipts' ) ).toBeNull();
		expect( store.seen ).toEqual( [ 'mv_stored' ] );
	} );
} );

describe( 'the shell', () => {
	beforeEach( () =>
		localStorage.setItem( 'matvis.app.apiToken', 'mv_stored' )
	);

	it( 'surfaces a load failure once, above the tabs', () => {
		store.data = purchaseData( {
			error: '2 receipts could not be loaded: boom',
		} );

		render( <App /> );

		expect(
			screen.getByText( 'Something did not load' )
		).toBeInTheDocument();
		expect(
			screen.getByText( '2 receipts could not be loaded: boom' )
		).toBeInTheDocument();
	} );

	it( 'shows first-load progress only while there is something to wait for', () => {
		store.data = purchaseData( { hydration: { done: 3, total: 10 } } );

		const { unmount } = render( <App /> );
		expect( screen.getByText( /Loading receipts/ ) ).toBeInTheDocument();
		unmount();

		store.data = purchaseData( { hydration: { done: 10, total: 10 } } );
		render( <App /> );
		expect( screen.queryByText( /Loading receipts/ ) ).toBeNull();
	} );

	it( 'shows the tab bar with four tabs', () => {
		store.data = purchaseData();

		render( <App /> );

		expect(
			screen.getByRole( 'tab', { name: 'Pantry' } )
		).toBeInTheDocument();
		expect(
			screen.getByRole( 'tab', { name: 'Insights' } )
		).toBeInTheDocument();
		expect(
			screen.getByRole( 'tab', { name: 'Purchases' } )
		).toBeInTheDocument();
		expect(
			screen.getByRole( 'tab', { name: 'Settings' } )
		).toBeInTheDocument();
	} );
} );
