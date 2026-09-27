import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../src/App';

/**
 * The landing page is static, so the only thing that can break is a link. It
 * is also the whole product's front door, and a wrong href there is invisible
 * until someone reports a 404.
 */
describe( 'landing page', () => {
	it( 'links to all three portals, relative to the Pages root', () => {
		render( <App /> );

		const hrefs = screen
			.getAllByRole( 'link' )
			.map( ( link ) => link.getAttribute( 'href' ) );

		// Relative, never leading-slash: the site build nests every frontend under
		// a base path and an absolute href would escape it.
		expect( hrefs ).toContain( 'connector/' );
		expect( hrefs ).toContain( 'catalog/' );
		expect( hrefs ).toContain( 'app/' );
		for ( const href of hrefs ) {
			if ( href?.startsWith( 'http' ) ) {
				continue;
			}
			expect( href?.startsWith( '/' ) ).toBe( false );
		}
	} );

	it( 'names each system as a link', () => {
		render( <App /> );

		// The desktop and phone layouts both render at once (a CSS media query
		// picks one), so each door appears twice.
		expect(
			screen.getAllByRole( 'link', { name: /^Catalog/ } )
		).toHaveLength( 2 );
		expect(
			screen.getAllByRole( 'link', { name: /^Connector/ } )
		).toHaveLength( 2 );
		expect(
			screen.getAllByRole( 'link', { name: /^Matvis app/ } )
		).toHaveLength( 2 );
	} );
} );
