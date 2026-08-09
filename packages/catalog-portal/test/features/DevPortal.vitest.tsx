import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getFunctionName, type FunctionReference } from 'convex/server';

/**
 * The developer page. Everything it says about shape is generated and covered
 * by the contract tests, so what is worth asserting here is the half that is
 * not documentation: "Try it" calls the real function with the arguments the
 * form built, and prints what actually came back.
 */

const backend = vi.hoisted(() => ({
  url: 'https://example-deployment.convex.cloud',
  calls: [] as { reference: unknown; args: unknown }[],
  result: [] as unknown,
  error: null as string | null,
  health: {
    total: 3,
    stores: [{ store: 'coop', count: 3 }],
    freshness: {
      verified: 1,
      neverFetched: 2,
      sampleSize: 3,
      sampleWithinMonth: 1,
    },
    coverage: { measuredAt: null, fields: [] },
  },
}));

vi.mock('convex/react', () => ({
  // The health block reads `catalog.health` reactively. It is not what these
  // tests are about, so it resolves to a fixed shape rather than undefined,
  // which would leave the block in its skeleton state forever.
  useQuery: () => backend.health,
  useConvex: () => ({
    url: backend.url,
    query: async (reference: unknown, args: unknown) => {
      backend.calls.push({ reference, args });
      if (backend.error) throw new Error(backend.error);
      return backend.result;
    },
  }),
}));

const { DevPortal } = await import('../../src/features/DevPortal');

/** The collapsed cards are triggers, named by the signature they carry. */
function expand(signature: string) {
  const trigger = screen
    .getAllByRole('button')
    .find((button) => button.textContent?.includes(signature));
  if (!trigger) throw new Error(`no operation card for ${signature}`);
  fireEvent.click(trigger);
}

beforeEach(() => {
  backend.calls = [];
  backend.result = [];
  backend.error = null;
});

describe('DevPortal', () => {
  it('offers every public operation, and the deployment to call it on', () => {
    render(<DevPortal />);

    for (const signature of [
      'catalog.getByEan({ ean })',
      'catalog.getManyByEan({ eans })',
      'catalog.search({ q?, paginationOpts })',
      'catalog.stats()',
    ]) {
      expect(screen.getByText(signature)).toBeInTheDocument();
    }
    expect(screen.getByText(new RegExp(backend.url))).toBeInTheDocument();
  });

  it('says plainly that source payloads are not kept', () => {
    render(<DevPortal />);

    expect(
      screen.getByText(/Source payloads are not stored\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/whatever it asks for/)).toBeInTheDocument();
  });

  it('runs the real query with the arguments the form built', async () => {
    backend.result = [{ ean: '11210000155', name: 'Tabasco' }];
    render(<DevPortal />);
    expand('catalog.getByEan');

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(backend.calls).toHaveLength(1));
    const call = backend.calls[0]!;
    expect(getFunctionName(call.reference as FunctionReference<'query'>)).toBe(
      'catalog:getByEan',
    );
    expect(call.args).toEqual({ ean: '11210000155' });
    expect(await screen.findByText(/"Tabasco"/)).toBeInTheDocument();
  });

  it('supplies paginationOpts itself and drops a blank optional', async () => {
    render(<DevPortal />);
    expand('catalog.search');

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(backend.calls).toHaveLength(1));
    expect(backend.calls[0]?.args).toEqual({
      q: 'kaffe',
      paginationOpts: { numItems: 3, cursor: null },
    });
  });

  it('shows what the deployment said when a call fails', async () => {
    backend.error = 'getManyByEan accepts at most 50 EANs, got 51';
    render(<DevPortal />);
    expand('catalog.getManyByEan');

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    // The notice also announces itself into a live region, so the message is on
    // the page twice by design.
    expect(await screen.findAllByText(backend.error)).not.toHaveLength(0);
  });
});
