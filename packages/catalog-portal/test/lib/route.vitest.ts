import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  ADMIN_PATH,
  eanFromPath,
  href,
  isAdminPath,
  navigate,
  productPath,
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
