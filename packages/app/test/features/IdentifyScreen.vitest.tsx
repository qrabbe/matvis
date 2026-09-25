import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { header, item, line } from '../support/fixtures';
import type { CatalogRow } from '@matvis/shared';

const store = vi.hoisted(() => ({
  linkCalls: [] as unknown[],
  unlinkCalls: [] as unknown[],
  markManyCalls: [] as unknown[],
  searchResults: [] as CatalogRow[],
}));

vi.mock('../../src/hooks/useMarks', () => ({
  useMarks: () => ({
    available: true,
    marks: [],
    mark: async () => {},
    markMany: async (args: unknown) => {
      store.markManyCalls.push(args);
    },
    unmark: async () => {},
    error: null,
  }),
}));

vi.mock('convex/react', () => ({
  useMutation: (fn: { name?: string }) => {
    // Distinguish link vs unlink by referential identity isn't possible on
    // a plain object stand-in, so both go through one spy and the tests
    // only exercise `link` directly.
    return async (args: unknown) => {
      store.linkCalls.push(args);
      return 'id_1';
    };
  },
  ConvexReactClient: class {
    async query() {
      return {
        page: store.searchResults,
        isDone: true,
        continueCursor: '',
      };
    }
  },
}));

const { IdentifyScreen } = await import('../../src/features/IdentifyScreen');

beforeEach(() => {
  store.linkCalls = [];
  store.unlinkCalls = [];
  store.markManyCalls = [];
  store.searchResults = [];
});

function unidentifiedLine(text: string, price = 22.24) {
  return line({
    item: item({ lineNo: 1, text, price, gtin: undefined, kind: undefined }),
    header: header({ purchasedAt: '2026-09-20T10:00:00.000Z' }),
    purchasedAt: new Date('2026-09-20T10:00:00.000Z'),
    product: null,
  });
}

describe('IdentifyScreen', () => {
  it('shows the printed text and lets "Not food" classify it with no gtin', async () => {
    const user = userEvent.setup();
    render(
      <IdentifyScreen
        lines={[unidentifiedLine('DISKBORSTE')]}
        selectedText="DISKBORSTE"
        token="tok_a"
        onBackToQueue={() => {}}
      />,
    );

    expect(screen.getByText('DISKBORSTE')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Not food' }));

    expect(store.linkCalls).toHaveLength(1);
    expect(store.linkCalls[0]).toMatchObject({
      token: 'tok_a',
      text: 'DISKBORSTE',
      kind: 'notFood',
      gtin: undefined,
    });
  });

  it('"Loose produce" and "Not in catalog" also link with no gtin', async () => {
    const user = userEvent.setup();
    render(
      <IdentifyScreen
        lines={[unidentifiedLine('TOMATER')]}
        selectedText="TOMATER"
        token="tok_a"
        onBackToQueue={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Loose produce' }));
    expect(store.linkCalls[0]).toMatchObject({ kind: 'produce' });

    await user.click(screen.getByRole('button', { name: 'Not in catalog' }));
    expect(store.linkCalls[1]).toMatchObject({ kind: 'notInCatalog' });
  });

  it('scopes a link to the selected price group', async () => {
    const user = userEvent.setup();
    const cheap = unidentifiedLine('HAVREGRYN', 19.9);
    const expensive = unidentifiedLine('HAVREGRYN', 34.9);
    render(
      <IdentifyScreen
        lines={[cheap, expensive]}
        selectedText="HAVREGRYN"
        token="tok_a"
        onBackToQueue={() => {}}
      />,
    );

    await user.click(screen.getByText(/19.90 kr/));
    await user.click(screen.getByRole('button', { name: 'Not food' }));

    expect(store.linkCalls[0]).toMatchObject({ price: 19.9 });
  });
});
