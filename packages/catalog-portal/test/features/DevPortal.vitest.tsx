import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * The developer page. It now calls the real HTTP endpoints with `fetch`
 * rather than the Convex client, so what is worth asserting here is: the base
 * URL is derived (not hard-coded), Try it builds the URL it says it built and
 * shows what came back, and the folded field list still renders.
 */

const backend = vi.hoisted( () => ( {
	url: 'https://example-deployment.convex.cloud',
} ) );

vi.mock( 'convex/react', () => ( {
	useConvex: () => ( { url: backend.url } ),
} ) );

const { DevPortal } = await import( '../../src/features/DevPortal' );

beforeEach( () => {
	vi.restoreAllMocks();
} );

describe( 'DevPortal', () => {
	it( 'derives the .convex.site base URL rather than hard-coding it', () => {
		render( <DevPortal /> );
		expect(
			screen.getByText( 'https://example-deployment.convex.site' )
		).toBeInTheDocument();
	} );

	it( 'opens the EAN endpoint by default and keeps the search one folded', () => {
		render( <DevPortal /> );
		expect(
			screen.getByText( 'GET /product?ean=…&store=…' )
		).toBeVisible();
		expect(
			screen.queryByRole( 'textbox', { name: 'q' } )
		).not.toBeInTheDocument();
	} );

	it( 'calls the real product URL and shows the answer', async () => {
		const row = { ean: '7310865078216', name: 'Laktosfri Standardmjölk' };
		const fetchMock = vi.fn().mockResolvedValue( {
			ok: true,
			json: async () => [ row ],
		} );
		vi.stubGlobal( 'fetch', fetchMock );

		render( <DevPortal /> );
		fireEvent.click( screen.getByRole( 'button', { name: 'Run' } ) );

		await waitFor( () => expect( fetchMock ).toHaveBeenCalledTimes( 1 ) );
		expect( fetchMock ).toHaveBeenCalledWith(
			'https://example-deployment.convex.site/product?ean=7310865078216'
		);
		expect(
			await screen.findByText( /"Laktosfri Standardmjölk"/ )
		).toBeInTheDocument();
	} );

	it( 'offers store as a dropdown of the chains actually catalogued', () => {
		render( <DevPortal /> );
		const store = screen.getByRole( 'combobox', { name: 'store' } );
		expect( store ).toHaveTextContent( 'Any' );
	} );

	it( 'shows the 400 error the deployment answered with', async () => {
		const fetchMock = vi.fn().mockResolvedValue( {
			ok: false,
			status: 400,
			json: async () => ( { error: 'ean is required' } ),
		} );
		vi.stubGlobal( 'fetch', fetchMock );

		render( <DevPortal /> );
		fireEvent.click( screen.getByRole( 'button', { name: 'Run' } ) );

		// The notice also announces itself into a live region, so the message is
		// on the page twice by design.
		expect(
			await screen.findAllByText( 'ean is required' )
		).not.toHaveLength( 0 );
	} );

	it( 'folds the product fields card and generates it from the contract', () => {
		render( <DevPortal /> );
		expect( screen.getByText( 'Product fields' ) ).toBeInTheDocument();
		expect(
			screen.getByText( /fields, generated from the contract/ )
		).toBeInTheDocument();
		fireEvent.click( screen.getByText( 'Product fields' ) );
		expect( screen.getByText( 'CatalogItem' ) ).toBeInTheDocument();
		// A field name unique to the generated list, not one of the endpoint
		// cards' own parameter rows.
		expect( screen.getByText( 'brand?' ) ).toBeInTheDocument();
		expect( screen.getByText( 'basisUnit' ) ).toBeInTheDocument();
	} );
} );
