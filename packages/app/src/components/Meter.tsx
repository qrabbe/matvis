import { CHART_CHROME } from './chartTheme';

export function Meter({
  value,
  max,
  label,
  fill = 'var(--wpds-color-background-interactive-brand-strong, #435ab8)',
}: {
  value: number;
  max: number;
  label: string;
  fill?: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
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
