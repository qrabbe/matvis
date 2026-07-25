import { describe, expect, it } from 'bun:test';
import {
  generateSessionToken,
  secretsMatch,
  sha256Hex,
} from '../convex/model/admin';

describe('sha256Hex', () => {
  it('matches the known digest of "hello"', async () => {
    expect(await sha256Hex('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('returns 64 lower case hex characters for any input', async () => {
    for (const input of ['', 'å', 'a'.repeat(10_000)]) {
      expect(await sha256Hex(input)).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('secretsMatch', () => {
  it('accepts an exact match and nothing else', async () => {
    expect(await secretsMatch('correct horse', 'correct horse')).toBe(true);
    expect(await secretsMatch('correct hors', 'correct horse')).toBe(false);
    expect(await secretsMatch('Correct horse', 'correct horse')).toBe(false);
    expect(await secretsMatch('', 'correct horse')).toBe(false);
  });

  it('compares digests, so a length difference is not a short circuit', async () => {
    // Both calls compare the same fixed 64 characters. This asserts the result
    // rather than the timing, which a unit test cannot see, but it pins the
    // behaviour the constant-time compare depends on.
    expect(await secretsMatch('a', 'a'.repeat(500))).toBe(false);
    expect(await secretsMatch('a'.repeat(500), 'a'.repeat(500))).toBe(true);
  });
});

describe('generateSessionToken', () => {
  it('is 32 bytes of hex and does not repeat', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      const token = generateSessionToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      tokens.add(token);
    }
    expect(tokens.size).toBe(100);
  });
});
