import { describe, expect, it } from 'bun:test';
import { isoWeekLabel } from '../../src/lib/format';

describe('isoWeekLabel', () => {
  it('labels a known ISO week correctly', () => {
    // 2026-09-25 is a Friday in ISO week 39 of 2026.
    expect(isoWeekLabel(new Date(2026, 8, 25))).toBe('Week 39');
  });

  it('rolls over at a week boundary (Monday starts a new week)', () => {
    expect(isoWeekLabel(new Date(2026, 8, 20))).toBe('Week 38'); // Sunday
    expect(isoWeekLabel(new Date(2026, 8, 21))).toBe('Week 39'); // Monday
  });
});
