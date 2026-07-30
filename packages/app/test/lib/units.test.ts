import { describe, expect, it } from 'bun:test';
import { parseUnit, toBaseUnits } from '../../src/lib/units';

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

describe('toBaseUnits', () => {
  // The dimension the callers compare is what prevents the bug this module
  // exists for: the old repo did `packageSize / basisQuantity` with no unit
  // check, so a 1.5 l bottle against a 100 ml basis produced 0.015 instead of
  // 15 — a silent 1000x error.
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
