import { describe, expect, it } from 'bun:test';
import { normalizeItemText, stripQuantitySuffix } from '../src/matching';

describe('normalizeItemText', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeItemText('  PESTO   PEPERONICO  ')).toBe(
      'pesto peperonico',
    );
  });

  it('strips a trailing price, so the same product keys the same', () => {
    expect(normalizeItemText('PESTO PEPERONICO 32,95')).toBe(
      'pesto peperonico',
    );
    expect(normalizeItemText('PESTO PEPERONICO 29,95')).toBe(
      'pesto peperonico',
    );
    expect(normalizeItemText('PESTO 32.95')).toBe('pesto');
  });

  it('strips a trailing negative price (discount line)', () => {
    expect(normalizeItemText('RABATT -5,00')).toBe('rabatt');
  });

  it('keeps a package size, so 1L and 1,5L stay distinct', () => {
    expect(normalizeItemText('MJÖLK 3% 1L 12,50')).toBe('mjölk 3% 1l');
    expect(normalizeItemText('MJÖLK 3% 1,5L 18,90')).toBe('mjölk 3% 1,5l');
  });

  it('keeps a quantity and a leading marker (they may distinguish products)', () => {
    expect(normalizeItemText('MJÖLK 2 ST 25,00')).toBe('mjölk 2 st');
    expect(normalizeItemText('BANAN 0,254 KG')).toBe('banan 0,254 kg');
    expect(normalizeItemText('* GURKA 14,50')).toBe('* gurka');
  });

  it('is idempotent', () => {
    const once = normalizeItemText('PESTO PEPERONICO 32,95');
    expect(normalizeItemText(once)).toBe(once);
  });

  it('yields an empty string for text that is only a price', () => {
    expect(normalizeItemText('  32,95 ')).toBe('');
  });
});

// Not wired into the matcher yet — see the doc comment on stripQuantitySuffix.
describe('stripQuantitySuffix', () => {
  it('strips a trailing quantity + unit', () => {
    expect(stripQuantitySuffix('MJÖLK 2 ST 25,00')).toBe('mjölk');
    expect(stripQuantitySuffix('BANAN 0,254 KG')).toBe('banan');
  });

  it('strips leading receipt markers', () => {
    expect(stripQuantitySuffix('* MJÖLK 12,50')).toBe('mjölk');
    expect(stripQuantitySuffix('- KAFFE ZOEGAS 59,00')).toBe('kaffe zoegas');
  });

  it('still keeps a package size glued to the number', () => {
    expect(stripQuantitySuffix('MJÖLK 3% 1L 12,50')).toBe('mjölk 3% 1l');
    expect(stripQuantitySuffix('COCA-COLA 33CL 12,00')).toBe('coca-cola 33cl');
  });

  it('is idempotent', () => {
    const once = stripQuantitySuffix('* BANAN 0,254 KG');
    expect(stripQuantitySuffix(once)).toBe(once);
  });
});
