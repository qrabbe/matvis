import { describe, expect, it } from 'bun:test';
import { convert, parseUnit, toBaseUnits } from '../../src/lib/units';

describe('parseUnit', () => {
  it('parses the Swedish display strings the catalog stores verbatim', () => {
    expect(parseUnit('Gram')).toEqual({ dimension: 'mass', toBase: 1 });
    expect(parseUnit('Kilogram')).toEqual({ dimension: 'mass', toBase: 1000 });
    expect(parseUnit('Liter')).toEqual({ dimension: 'volume', toBase: 1000 });
    expect(parseUnit('Styck')).toEqual({ dimension: 'count', toBase: 1 });
  });

  it('parses the abbreviations receipts print, case and dot insensitively', () => {
    expect(parseUnit('KG')).toEqual({ dimension: 'mass', toBase: 1000 });
    expect(parseUnit('st.')).toEqual({ dimension: 'count', toBase: 1 });
    expect(parseUnit(' ml ')).toEqual({ dimension: 'volume', toBase: 1 });
  });

  it('returns null for anything unrecognised rather than guessing', () => {
    expect(parseUnit('förpackning om 6')).toBeNull();
    expect(parseUnit('')).toBeNull();
    expect(parseUnit(undefined)).toBeNull();
    expect(parseUnit(null)).toBeNull();
  });
});

describe('convert', () => {
  it('converts within a dimension', () => {
    expect(convert(1.5, 'Liter', 'ml')).toBe(1500);
    expect(convert(250, 'g', 'kg')).toBe(0.25);
    expect(convert(2, 'dl', 'cl')).toBe(20);
  });

  // The bug this whole module exists to prevent: the old repo did
  // `packageSize / basisQuantity` with no unit check, so a 1.5 l bottle against
  // a 100 ml basis produced 0.015 instead of 15 — a silent 1000x error.
  it('returns null across dimensions instead of a plausible wrong number', () => {
    expect(convert(1.5, 'Liter', 'g')).toBeNull();
    expect(convert(1, 'Styck', 'g')).toBeNull();
    expect(convert(500, 'Gram', 'ml')).toBeNull();
  });

  it('returns null when either unit is unrecognised', () => {
    expect(convert(1, 'flaska', 'ml')).toBeNull();
    expect(convert(1, 'ml', 'flaska')).toBeNull();
  });
});

describe('toBaseUnits', () => {
  it('reports the dimension alongside the base-unit amount', () => {
    expect(toBaseUnits(1.5, 'Liter')).toEqual({
      dimension: 'volume',
      amount: 1500,
    });
    expect(toBaseUnits(2, 'kg')).toEqual({ dimension: 'mass', amount: 2000 });
  });

  it('returns null for an unrecognised unit', () => {
    expect(toBaseUnits(1, 'knippe')).toBeNull();
  });
});
