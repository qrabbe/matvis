export type Dimension = 'mass' | 'volume' | 'count';

export interface ParsedUnit {
  dimension: Dimension;
  toBase: number;
}

const UNITS: Record<string, ParsedUnit> = {
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

  st: { dimension: 'count', toBase: 1 },
  styck: { dimension: 'count', toBase: 1 },
  stycken: { dimension: 'count', toBase: 1 },
  pcs: { dimension: 'count', toBase: 1 },
  förp: { dimension: 'count', toBase: 1 },
  forp: { dimension: 'count', toBase: 1 },
};

function unitKey(raw: string): string {
  return raw.toLowerCase().trim().replace(/\.+$/, '');
}

export function parseUnit(raw: string | null | undefined): ParsedUnit | null {
  if (!raw) return null;
  return UNITS[unitKey(raw)] ?? null;
}

export function toBaseUnits(
  quantity: number,
  unit: string | null | undefined,
): { dimension: Dimension; amount: number } | null {
  const parsed = parseUnit(unit);
  if (!parsed) return null;
  return { dimension: parsed.dimension, amount: quantity * parsed.toBase };
}
