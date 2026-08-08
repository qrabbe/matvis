import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The visitor id is written once and read forever, so the two things worth
 * asserting are that it is stable and that a browser refusing localStorage
 * still gets one instead of throwing on the way to a search. */

/** Warms the transform of the module and its `@matvis/ui` dependency once, so
 * the first `freshModule()` inside a test is not paying for it. */
await import('../../src/lib/visitor');

function freshModule() {
  vi.resetModules();
  return import('../../src/lib/visitor');
}

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.unstubAllGlobals();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('visitorId', () => {
  it('returns the same id across calls', async () => {
    const { visitorId } = await freshModule();
    const first = visitorId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(visitorId()).toBe(first);
  });

  it('survives a reload, which is the whole point of storing it', async () => {
    const { visitorId: first } = await freshModule();
    const id = first();

    // A second module instance against the same storage is a fresh page load.
    const { visitorId: second } = await freshModule();
    expect(second()).toBe(id);
  });

  it('still returns an id when localStorage refuses to write', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    });

    const { visitorId } = await freshModule();
    const id = visitorId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    // Stable for the life of the tab, so one session is not counted as many.
    expect(visitorId()).toBe(id);
  });

  it('still returns an id when localStorage refuses to read', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
      removeItem: () => {},
    });

    const { visitorId } = await freshModule();
    expect(visitorId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
