import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CatalogRow } from '@matvis/shared';

/**
 * One barcode can hold one row per chain, so the product page is a view of a
 * set rather than of a document. What is worth asserting is the selection: that
 * two rows are reachable, that one row is not dressed up as a choice, and that
 * a store picked on one product cannot address a different store on the next.
 */

const backend = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock('convex/react', () => ({
  useQuery: () => backend.rows,
}));

const { ProductDetail } = await import('../../src/features/ProductDetail');

function row(store: string, name: string): CatalogRow {
  return {
    _id: `${store}-${name}` as CatalogRow['_id'],
    _creationTime: 1_700_000_000_000,
    ean: '7311041078143',
    name,
    store: store as CatalogRow['store'],
  };
}

beforeEach(() => {
  backend.rows = [];
});

describe('a product in one catalog', () => {
  it('renders the row with no tabs to choose between', () => {
    backend.rows = [row('coop', 'Havregryn Coop')];

    render(<ProductDetail ean="7311041078143" />);

    expect(screen.getByText('Havregryn Coop')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('a product in two catalogs', () => {
  beforeEach(() => {
    backend.rows = [row('coop', 'Havregryn Coop'), row('ica', 'Havregryn ICA')];
  });

  it('offers one tab per store and opens on the first', () => {
    render(<ProductDetail ean="7311041078143" />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Coop', 'ICA']);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Havregryn Coop')).toBeTruthy();
  });

  it('switches the page to the store that was picked', () => {
    render(<ProductDetail ean="7311041078143" />);

    fireEvent.click(screen.getByRole('tab', { name: 'ICA' }));

    expect(screen.getByText('Havregryn ICA')).toBeTruthy();
    expect(
      screen.getByRole('tab', { name: 'ICA' }).getAttribute('aria-selected'),
    ).toBe('true');
  });
});

describe('the picked store outliving the product', () => {
  it('falls back to the first row when the next product has no such store', () => {
    backend.rows = [row('coop', 'Havregryn Coop'), row('ica', 'Havregryn ICA')];
    const view = render(<ProductDetail ean="7311041078143" />);

    fireEvent.click(screen.getByRole('tab', { name: 'ICA' }));

    // The route swaps the EAN under a mounted component, so the ICA selection
    // survives into a product that only Coop stocks.
    backend.rows = [row('coop', 'Knäckebröd Coop')];
    view.rerender(<ProductDetail ean="7311041000001" />);

    expect(screen.getByText('Knäckebröd Coop')).toBeTruthy();
    expect(screen.queryByText('Havregryn ICA')).toBeNull();
  });
});
