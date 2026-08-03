import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../src/App';

/** The landing page is static, so the only thing that can break is a link. It
 * is also the whole product's front door, and a wrong href there is invisible
 * until someone reports a 404. */
describe('landing page', () => {
  it('links to all three portals, relative to the Pages root', () => {
    render(<App />);

    const hrefs = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));

    // Relative, never leading-slash: the site build nests every frontend under
    // a base path and an absolute href would escape it.
    expect(hrefs).toContain('connector/');
    expect(hrefs).toContain('catalog/');
    expect(hrefs).toContain('app/');
    for (const href of hrefs) {
      expect(href?.startsWith('/')).toBe(false);
    }
  });

  it('names each system and its status', () => {
    render(<App />);

    expect(screen.getByText('Connector')).toBeInTheDocument();
    expect(screen.getByText('Catalog')).toBeInTheDocument();
    expect(screen.getByText('Matvis app')).toBeInTheDocument();
    expect(screen.getByText('in progress')).toBeInTheDocument();
  });
});
