/**
 * Guarded parsing of the unit strings that reach the app, and conversion
 * between them. Pure.
 *
 * Two vocabularies meet here and neither is normalized at the source:
 *
 * - `CatalogItem.packageSizeUnit` is documented as *"verbatim from the source,
 *   e.g. `Gram`"* — a Swedish display string.
 * - `receiptItems.unit` is whatever the receipt printed, e.g. `"KG"`.
 * - `CatalogNutrition.basisUnit` is the one clean one: `"g"`, `"ml"` or `"st"`.
 *
 * The whole point of this file is the {@link Dimension} check. The old repo
 * computed `scale = packageSize / basisQuantity` with no unit check at all, so a
 * 1.5 **l** bottle against a 100 **ml** basis produced a scale of 0.015 instead
 * of 15 — a silent 1000× error on every downstream number. Here an unparseable
 * unit, or one in the wrong dimension, returns `null` and the line is counted as
 * "not scalable" in the coverage meter. A missing number is recoverable; a wrong
 * one is not.
 *
 * Ticket 16 moves this onto the catalog as a canonical net content, at which
 * point this file becomes a fallback for rows produced before that landed.
 */

/** What a unit measures. Conversion is only ever defined within one of these. */
export type Dimension = 'mass' | 'volume' | 'count';

export interface ParsedUnit {
  dimension: Dimension;
  /** Multiply a quantity in this unit by this to get the dimension's base unit
   * (grams for mass, millilitres for volume, pieces for count). */
  toBase: number;
}

/**
 * Every unit spelling seen across the three vocabularies, keyed by its
 * lowercased, punctuation-stripped form. Deliberately a closed list rather than
 * a pattern: an unrecognised unit must fail loudly into `null`, and a clever
 * regex would instead confidently mis-parse the next surprise the sources ship.
 */
const UNITS: Record<string, ParsedUnit> = {
  // ── Mass, base gram ──
  g: { dimension: 'mass', toBase: 1 },
  gr: { dimension: 'mass', toBase: 1 },
  gram: { dimension: 'mass', toBase: 1 },
  grammes: { dimension: 'mass', toBase: 1 },
  hg: { dimension: 'mass', toBase: 100 },
  hekto: { dimension: 'mass', toBase: 100 },
  hektogram: { dimension: 'mass', toBase: 100 },
  kg: { dimension: 'mass', toBase: 1000 },
  kilo: { dimension: 'mass', toBase: 1000 },
  kilogram: { dimension: 'mass', toBase: 1000 },
  mg: { dimension: 'mass', toBase: 0.001 },
  milligram: { dimension: 'mass', toBase: 0.001 },

  // ── Volume, base millilitre ──
  ml: { dimension: 'volume', toBase: 1 },
  milliliter: { dimension: 'volume', toBase: 1 },
  millilitre: { dimension: 'volume', toBase: 1 },
  cl: { dimension: 'volume', toBase: 10 },
  centiliter: { dimension: 'volume', toBase: 10 },
  dl: { dimension: 'volume', toBase: 100 },
  deciliter: { dimension: 'volume', toBase: 100 },
  l: { dimension: 'volume', toBase: 1000 },
  lit: { dimension: 'volume', toBase: 1000 },
  liter: { dimension: 'volume', toBase: 1000 },
  litre: { dimension: 'volume', toBase: 1000 },

  // ── Count, base piece ──
  st: { dimension: 'count', toBase: 1 },
  styck: { dimension: 'count', toBase: 1 },
  stycken: { dimension: 'count', toBase: 1 },
  pcs: { dimension: 'count', toBase: 1 },
  förp: { dimension: 'count', toBase: 1 },
  forp: { dimension: 'count', toBase: 1 },
};

/**
 * Reduce a raw unit string to its lookup key: lowercased, trimmed, and stripped
 * of the trailing dot Swedish abbreviations often carry (`"st."`).
 */
function unitKey(raw: string): string {
  return raw.toLowerCase().trim().replace(/\.+$/, '');
}

/**
 * Parse a unit string from any of the three vocabularies, or `null` when it is
 * absent or not recognised. `null` is a normal, expected answer — callers must
 * treat it as "cannot scale this line" and count it, never as an error.
 */
export function parseUnit(raw: string | null | undefined): ParsedUnit | null {
  if (!raw) return null;
  return UNITS[unitKey(raw)] ?? null;
}

/**
 * Convert `quantity` from one unit to another, or `null` when either unit is
 * unrecognised or the two measure different things. Converting 1.5 `Liter` to
 * `ml` gives 1500; converting it to `g` gives `null`, which is the case the old
 * repo got silently wrong.
 */
export function convert(
  quantity: number,
  from: string | null | undefined,
  to: string | null | undefined,
): number | null {
  const source = parseUnit(from);
  const target = parseUnit(to);
  if (!source || !target) return null;
  if (source.dimension !== target.dimension) return null;
  return (quantity * source.toBase) / target.toBase;
}

/** A quantity expressed in its dimension's base unit (g / ml / st), or `null`
 * when the unit is unrecognised. */
export function toBaseUnits(
  quantity: number,
  unit: string | null | undefined,
): { dimension: Dimension; amount: number } | null {
  const parsed = parseUnit(unit);
  if (!parsed) return null;
  return { dimension: parsed.dimension, amount: quantity * parsed.toBase };
}
