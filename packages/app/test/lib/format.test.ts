import { describe, expect, it } from 'bun:test';
import { errMsg, formatAmount } from '../../src/lib/format';

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
