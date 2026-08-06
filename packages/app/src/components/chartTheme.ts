// The palette is validated as a set on the dark surface for CVD separation and
// contrast. Do not edit a value without re-running the validator.
export const SERIES = {
  protein: '#608ff5',
  fat: '#bd7ba7',
  carbs: '#2cb03f',
} as const;

export const PRIMARY_SERIES = SERIES.protein;

export const SEQUENTIAL = [
  '#314673',
  '#3a5aa1',
  '#466fcb',
  '#5686f2',
  '#77a2fc',
] as const;

export const EMPTY_CELL = '#1c1c1c';

export const CHART_CHROME = {
  grid: 'var(--wpds-color-stroke-surface-neutral, #2a2626)',
  axis: 'var(--wpds-color-foreground-content-neutral-weak, #9aa0a6)',
  text: 'var(--wpds-color-foreground-content-neutral, #f4f4fa)',
  surface: 'var(--wpds-color-background-surface-neutral-strong, #1a1a1a)',
  border: 'var(--wpds-color-stroke-surface-neutral-strong, #5c5555)',
} as const;

export const AXIS_PROPS = {
  stroke: CHART_CHROME.axis,
  tick: { fill: CHART_CHROME.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: CHART_CHROME.grid },
} as const;

export const TOOLTIP_STYLE = {
  background: CHART_CHROME.surface,
  border: `1px solid ${CHART_CHROME.border}`,
  borderRadius: 6,
  color: CHART_CHROME.text,
  fontSize: 12,
  padding: '8px 10px',
} as const;

export const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

export function rampStep(value: number, max: number): string {
  if (!(value > 0)) return EMPTY_CELL;
  if (!(max > 0)) return SEQUENTIAL[0];
  const scaled = Math.log2(1 + value) / Math.log2(1 + max);
  const index = Math.min(
    SEQUENTIAL.length - 1,
    Math.max(0, Math.floor(scaled * SEQUENTIAL.length)),
  );
  return SEQUENTIAL[index] ?? SEQUENTIAL[0];
}
