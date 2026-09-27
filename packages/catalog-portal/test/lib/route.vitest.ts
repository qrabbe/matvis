import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  ADMIN_PATH,
  branchPath,
  catalogRoute,
  categoryPath,
  DEVELOPERS_PATH,
  eanFromPath,
  href,
  isAdminPath,
  isDevelopersPath,
  navigate,
  productPath,
  searchPath,
  storeFrontPath,
  useRoute,
} from '../../src/lib/route';

/**
 * Hash routing. The portal is a static bundle with no server able to rewrite
 * unknown paths, so the hash is the whole routing story — and a deep link that
 * does not survive a cold load is the one case the route exists for.
 */

beforeEach(() => {
  window.location.hash = '';
});

describe('useRoute', () => {
  it('reads the current hash and follows navigation', async () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current).toBe('/');

    navigate(productPath('7311312009203'));

    await waitFor(() => expect(result.current).toBe('/p/7311312009203'));
  });

  it('follows the back button, not just in-app navigation', async () => {
    const { result } = renderHook(() => useRoute());
    navigate(ADMIN_PATH);
    await waitFor(() => expect(result.current).toBe(ADMIN_PATH));

    window.history.back();

    await waitFor(() => expect(result.current).toBe('/'));
  });
});

describe('product routes', () => {
  it('round-trips an EAN through the path', () => {
    expect(eanFromPath(productPath('7311312009203'))).toBe('7311312009203');
  });

  it('encodes and decodes an EAN that is not URL-safe', () => {
    const odd = 'a/b c';
    expect(productPath(odd)).toBe('/p/a%2Fb%20c');
    expect(eanFromPath(productPath(odd))).toBe(odd);
  });

  it('is not a product route', () => {
    expect(eanFromPath('/')).toBeNull();
    expect(eanFromPath(ADMIN_PATH)).toBeNull();
  });

  it('round-trips an EAN carrying a store', () => {
    expect(productPath('7311312009203', 'ica')).toBe(
      '/p/7311312009203?store=ica',
    );
    expect(eanFromPath(productPath('7311312009203', 'ica'))).toBe(
      '7311312009203',
    );
  });
});

describe('the admin path', () => {
  it('matches with or without a trailing slash', () => {
    expect(isAdminPath(ADMIN_PATH)).toBe(true);
    expect(isAdminPath(`${ADMIN_PATH}/`)).toBe(true);
    expect(isAdminPath('/admin/x')).toBe(false);
  });

  it('makes a real anchor href, so middle-click and copy-link work', () => {
    expect(href(ADMIN_PATH)).toBe('#/admin');
  });
});

describe('the developers path', () => {
  it('matches with or without a trailing slash', () => {
    expect(isDevelopersPath(DEVELOPERS_PATH)).toBe(true);
    expect(isDevelopersPath(`${DEVELOPERS_PATH}/`)).toBe(true);
    expect(isDevelopersPath('/developers/x')).toBe(false);
  });

  it('can be linked to', () => {
    expect(href(DEVELOPERS_PATH)).toBe('#/developers');
  });
});

describe('the store front path', () => {
  it('is the root for Coop, and never for any other store', () => {
    expect(storeFrontPath('coop')).toBe('/');
    expect(storeFrontPath('ica')).toBe('/c/ica');
  });
});

describe('the search path', () => {
  it('carries the store and, when there is one, the term', () => {
    expect(searchPath('coop', 'mjölk')).toBe('/s/coop?q=mj%C3%B6lk');
    expect(searchPath('ica', '')).toBe('/s/ica');
  });
});

describe('catalogRoute', () => {
  it("is Coop's front page at the root, and for anything it does not recognise", () => {
    expect(catalogRoute('/')).toEqual({ kind: 'front', store: 'coop' });
    expect(catalogRoute('/nonsense')).toEqual({
      kind: 'front',
      store: 'coop',
    });
  });

  it("reads a chain's front page", () => {
    expect(catalogRoute('/c/ica')).toEqual({ kind: 'front', store: 'ica' });
  });

  it('reads search results and their term', () => {
    expect(catalogRoute('/s/coop?q=mj%C3%B6lk')).toEqual({
      kind: 'search',
      store: 'coop',
      term: 'mjölk',
    });
  });

  it('reads a search route with no term as an empty search', () => {
    expect(catalogRoute('/s/ica')).toEqual({
      kind: 'search',
      store: 'ica',
      term: '',
    });
  });

  it('reads a top-level category', () => {
    expect(catalogRoute('/c/coop/mejeri-agg')).toEqual({
      kind: 'category',
      store: 'coop',
      slugPath: 'mejeri-agg',
    });
  });

  it('reads a leaf several levels deep', () => {
    expect(catalogRoute('/c/coop/mejeri-agg/mjolk/laktosfri-mjolk')).toEqual({
      kind: 'category',
      store: 'coop',
      slugPath: 'mejeri-agg/mjolk/laktosfri-mjolk',
    });
  });

  it('reads a branch\'s "all products" address', () => {
    expect(catalogRoute('/c/coop/mejeri-agg/all')).toEqual({
      kind: 'branch',
      store: 'coop',
      slugPath: 'mejeri-agg',
    });
  });

  it('reads the uncategorised rows as an ordinary top-level category', () => {
    expect(catalogRoute('/c/coop/other')).toEqual({
      kind: 'category',
      store: 'coop',
      slugPath: 'other',
    });
  });

  it('tolerates a trailing slash on a category address', () => {
    expect(catalogRoute('/c/coop/mejeri-agg/')).toEqual({
      kind: 'category',
      store: 'coop',
      slugPath: 'mejeri-agg',
    });
  });
});

describe('category addresses', () => {
  it('nests a slug path under the store', () => {
    expect(categoryPath('coop', 'mejeri-agg/mjolk')).toBe(
      '/c/coop/mejeri-agg/mjolk',
    );
  });

  it('adds "all" for a branch\'s full product list', () => {
    expect(branchPath('coop', 'mejeri-agg')).toBe('/c/coop/mejeri-agg/all');
  });
});
