import { Badge } from '@wordpress/ui';

/**
 * Change against the immediately preceding period of equal length.
 *
 * Renders nothing when `change` is `null` — which is what `relativeChange`
 * returns with no baseline. A trend against zero is not "+100%", it is "no
 * comparison", and an absent badge says that better than a confident-looking
 * number would.
 *
 * The badge intent is deliberately `informational` in both directions rather
 * than green-up / red-down: whether buying more protein or spending more money
 * is good is the user's business, not the app's, and colouring it as success or
 * failure is a judgement the data does not support.
 */
export function TrendBadge({
  change,
  periodLabel = 'vs previous period',
}: {
  /** Relative change, e.g. 0.12 for +12%. `null` renders nothing. */
  change: number | null;
  periodLabel?: string;
}) {
  if (change === null || !Number.isFinite(change)) return null;
  const percent = Math.round(change * 100);
  const sign = percent > 0 ? '+' : '';
  return (
    <Badge intent="informational" title={periodLabel}>
      {`${sign}${percent}%`}
    </Badge>
  );
}
