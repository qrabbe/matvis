import { describe, expect, it } from 'bun:test';
import { chunk, errMsg, formatAmount } from '@matvis/shared';

describe('formatAmount', () => {
  it('formats a value with two decimals and the currency', () => {
    expect(formatAmount(32.95)).toBe('32.95 SEK');
    expect(formatAmount(10, 'EUR')).toBe('10.00 EUR');
  });
  it('renders an em dash for undefined', () => {
    expect(formatAmount(undefined)).toBe('—');
  });
});

describe('errMsg', () => {
  it('extracts an Error message and stringifies anything else', () => {
    expect(errMsg(new Error('boom'))).toBe('boom');
    expect(errMsg('plain')).toBe('plain');
  });
});

describe('chunk', () => {
  it('splits to the server cap without losing the remainder', () => {
    const values = Array.from({ length: 7 }, (_, i) => i);
    expect(chunk(values, 3)).toEqual([[0, 1, 2], [3, 4, 5], [6]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
