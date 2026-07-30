import { CHART_CHROME } from './chartTheme';

/**
 * The app's one progress bar: a track, a proportional fill and the ARIA a screen
 * reader needs to announce the ratio rather than read a bare decoration.
 *
 * Local rather than borrowed because `@wordpress/ui` has no progress primitive
 * and the classic `@wordpress/components` `ProgressBar` needs a block of theme
 * overrides and still cannot take a per-instance fill colour, which coverage
 * needs.
 */
export function Meter({
  value,
  max,
  label,
  fill = 'var(--wpds-color-background-interactive-brand-strong, #435ab8)',
}: {
  value: number;
  max: number;
  /** Announced by assistive technology, which has no other way to read this. */
  label: string;
  /** Overrides the brand fill, for a bar that belongs to a chart series. */
  fill?: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  // A non-zero value always shows at least a sliver: rounding a real 0.4% down
  // to an empty bar would read as "none", which is a different fact.
  const width = ratio > 0 ? Math.max(ratio * 100, 1) : 0;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      style={{
        height: 6,
        borderRadius: 3,
        background: CHART_CHROME.grid,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${width}%`,
          height: '100%',
          borderRadius: 3,
          background: fill,
        }}
      />
    </div>
  );
}
