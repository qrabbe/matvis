import { Badge } from '@wordpress/ui';

export function TrendBadge({
  change,
  periodLabel = 'vs previous period',
}: {
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
