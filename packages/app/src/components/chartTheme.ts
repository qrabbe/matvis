/**
 * The one place chart colour and chrome are decided. Every chart imports from
 * here and nothing styles a mark inline — that is what keeps the charts reading
 * as the same system as the badges and notices instead of as recharts' defaults.
 * (The old repo hardcoded `#19191C` and `rgba(255,255,255,0.06)` into every
 * chart, which is exactly what this file exists to prevent.)
 *
 * ── Why these are literal hexes and not `--wpds-*` tokens ────────────────────
 *
 * The Matvis theme's semantic colours are UI colours — text, badges, notices —
 * and they do NOT survive use as chart marks. Running the design-system palette
 * through the dataviz validator against this app's own dark surface (#0e0e0e)
 * fails on three counts:
 *
 * - `primary` and `info` are the SAME hex (#89a8e8), so any scheme that assigns
 *   one to each of two series draws them identically.
 * - #89a8e8 sits at OKLCH L 0.73, outside the 0.48–0.67 band a dark-surface mark
 *   needs, and at chroma 0.10 it is on the floor where a fill reads grey.
 * - `success` (#17bf39) against `caution` (#c6a800) separates by ΔE 2.5 under
 *   protanopia, and `warning` (#cf995d) against `caution` by ΔE 8.0 even in full
 *   colour vision — both far below the thresholds for marks a reader has to tell
 *   apart.
 *
 * So the marks get their own validated steps, picked in the same hue families as
 * the theme so the two read as one system. Status colours (success / warning /
 * caution / error) stay reserved for status and are never reused as a series.
 */

/**
 * The categorical theme: the ONLY place in the app where two or more series
 * share a chart (the macro split bar). Three slots, assigned in fixed order and
 * never cycled.
 *
 * Validated on the dark surface #0e0e0e: lightness band PASS, chroma floor PASS,
 * CVD separation PASS (worst all-pairs ΔE 11.9 protan), normal-vision floor PASS
 * (worst ΔE 16.7), contrast PASS (all ≥ 3:1). Do not edit a value here without
 * re-running the validator — the pairs are close to the floor by construction,
 * because the dark band leaves little room.
 *
 * A fourth macro is not a fourth hue: five distinct series do not fit these
 * thresholds inside the dark lightness band at all, which is why the daily chart
 * below is single-series.
 */
export const SERIES = {
  /** Blue, the brand hue stepped into the mark band. */
  protein: '#608ff5',
  /** Muted rose. */
  fat: '#bd7ba7',
  /** Green. */
  carbs: '#2cb03f',
} as const;

/**
 * The daily nutrition chart is deliberately SINGLE-series: it plots whichever
 * nutrient the picker selects, one at a time. A single series needs no legend
 * and no categorical slot — the axis label and the picker already name it — so
 * recolouring the bars per nutrient would encode nothing and would just spend
 * hues the palette does not have to spare.
 */
export const PRIMARY_SERIES = SERIES.protein;

/**
 * Sequential ramp for the activity heatmap: one hue, dim → bright, five steps.
 * Never a rainbow. Validated as an ordinal ramp on #0e0e0e: monotone lightness
 * PASS, adjacent ΔL ≥ 0.06 PASS, dimmest step 2.07:1 against the surface PASS,
 * single hue (spread 0°) PASS.
 *
 * The dimmest step is deliberately not the surface colour: a cell with a small
 * purchase must still read as a cell, not as a hole in the grid.
 */
export const SEQUENTIAL = [
  '#314673',
  '#3a5aa1',
  '#466fcb',
  '#5686f2',
  '#77a2fc',
] as const;

/** An empty day in the heatmap — a recessive surface, not a ramp step, so
 * "nothing bought" never reads as "a little bought". */
export const EMPTY_CELL = '#1c1c1c';

/**
 * Chrome. Grid and axes are recessive by design: the marks carry the data and
 * everything else should be legible without competing. These read the theme's
 * own tokens where a token exists, with the palette value as the fallback for
 * when a chart renders outside the provider (e.g. a Storybook story).
 */
export const CHART_CHROME = {
  grid: 'var(--wpds-color-stroke-surface-neutral, #2a2626)',
  axis: 'var(--wpds-color-foreground-content-neutral-weak, #9aa0a6)',
  text: 'var(--wpds-color-foreground-content-neutral, #f4f4fa)',
  surface: 'var(--wpds-color-background-surface-neutral-strong, #1a1a1a)',
  border: 'var(--wpds-color-stroke-surface-neutral-strong, #5c5555)',
} as const;

/** Axis props every chart spreads, so tick styling cannot drift between charts. */
export const AXIS_PROPS = {
  stroke: CHART_CHROME.axis,
  tick: { fill: CHART_CHROME.axis, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: CHART_CHROME.grid },
} as const;

/** Tooltip container styling, matching the theme's elevated surface. */
export const TOOLTIP_STYLE = {
  background: CHART_CHROME.surface,
  border: `1px solid ${CHART_CHROME.border}`,
  borderRadius: 6,
  color: CHART_CHROME.text,
  fontSize: 12,
  padding: '8px 10px',
} as const;

/** Rounded data-end for a bar, anchored to the baseline. */
export const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

/**
 * Pick a ramp step for a value against a maximum, on a **log₂** scale, so
 * 10 → 100 kr is the same visual step as 100 → 1000 kr. Grocery spend spans two
 * orders of magnitude across days and a linear ramp would paint every ordinary
 * day the same dim step and one big shop the only bright cell.
 *
 * Returns {@link EMPTY_CELL} for nothing at all — an absent day and a cheap day
 * must not look alike.
 */
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
