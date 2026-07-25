import { describe, expect, it } from 'bun:test';
import { normalizeItemText } from '../src/matching';

describe('normalizeItemText', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeItemText('  PESTO   PEPERONICO  ')).toBe(
      'pesto peperonico',
    );
  });

  it('strips a trailing price', () => {
    expect(normalizeItemText('PESTO PEPERONICO 32,95')).toBe(
      'pesto peperonico',
    );
    expect(normalizeItemText('PESTO 32.95')).toBe('pesto');
  });

  it('strips a trailing negative price (discount line)', () => {
    expect(normalizeItemText('RABATT -5,00')).toBe('rabatt');
  });

  it('strips a trailing quantity and unit, in either order', () => {
    expect(normalizeItemText('BANAN 0,254 KG')).toBe('banan');
    expect(normalizeItemText('MJÖLK 2 ST 25,00')).toBe('mjölk');
  });

  it('strips leading receipt markers', () => {
    expect(normalizeItemText('* MJÖLK 12,50')).toBe('mjölk');
  });

  it('keeps a package size printed as part of the name', () => {
    expect(normalizeItemText('MJÖLK 3% 1L 12,50')).toBe('mjölk 3% 1l');
    expect(normalizeItemText('MJÖLK 3% 1,5L 12,50')).toBe('mjölk 3% 1,5l');
  });

  it('is idempotent', () => {
    const once = normalizeItemText('PESTO PEPERONICO 32,95');
    expect(normalizeItemText(once)).toBe(once);
  });

  it('yields an empty string for text that is only noise', () => {
    expect(normalizeItemText('  32,95 ')).toBe('');
  });
});
