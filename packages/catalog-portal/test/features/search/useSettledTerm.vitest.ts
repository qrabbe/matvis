import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSettledTerm } from '../../../src/features/search/useSettledTerm';

const DELAY_MS = 1000;

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('typing', () => {
  it('does not settle until the typing stops', () => {
    const { result, rerender } = renderHook(
      ({ term }) => useSettledTerm(term, DELAY_MS),
      { initialProps: { term: '' } },
    );

    rerender({ term: 'h' });
    wait(300);
    rerender({ term: 'ha' });
    wait(300);
    rerender({ term: 'hav' });
    wait(999);

    expect(result.current.searchedTerm).toBe('');
    expect(result.current.waiting).toBe(true);
  });

  it('settles on the term left in the box, one second after the last change', () => {
    const { result, rerender } = renderHook(
      ({ term }) => useSettledTerm(term, DELAY_MS),
      { initialProps: { term: '' } },
    );

    rerender({ term: 'h' });
    wait(300);
    rerender({ term: 'hav' });
    wait(1000);

    expect(result.current.searchedTerm).toBe('hav');
    expect(result.current.waiting).toBe(false);
  });
});

describe('searchNow', () => {
  it('settles immediately on the current term, and not again when the wait runs out', () => {
    const { result, rerender } = renderHook(
      ({ term }) => useSettledTerm(term, DELAY_MS),
      { initialProps: { term: '' } },
    );

    rerender({ term: 'hav' });
    act(() => result.current.searchNow());
    expect(result.current.searchedTerm).toBe('hav');

    wait(2000);
    expect(result.current.searchedTerm).toBe('hav');
  });

  it('accepts an explicit term, for a clear button acting ahead of a pending typedTerm update', () => {
    const { result, rerender } = renderHook(
      ({ term }) => useSettledTerm(term, DELAY_MS),
      { initialProps: { term: 'hav' } },
    );
    wait(1000);

    rerender({ term: '' });
    act(() => result.current.searchNow(''));
    expect(result.current.searchedTerm).toBe('');
  });
});
