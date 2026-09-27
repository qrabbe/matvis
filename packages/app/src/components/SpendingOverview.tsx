import { useMemo } from 'react';
import { Text } from '@wordpress/ui';
import type { ReceiptHeader } from '@matvis/shared';
import { Heatmap } from './Heatmap';
import { formatKr } from '../lib/format';
import { dailySpend, headlineStats } from '../lib/stats';

export function SpendingOverview({
  headers,
  today,
}: {
  headers: readonly ReceiptHeader[];
  today: Date;
}) {
  const stats = useMemo(() => headlineStats(headers), [headers]);
  const spendByDay = useMemo(() => dailySpend(headers), [headers]);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}
      >
        <StatBox label="Total spend" value={formatKr(stats.spend)} />
        <StatBox label="Receipts" value={String(stats.receipts)} />
        <StatBox label="Avg. basket" value={formatKr(stats.averageBasket)} />
        <StatBox label="Discounts" value={formatKr(stats.discounts)} />
      </div>
      <Heatmap spendByDay={spendByDay} todayMs={today.getTime()} />
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 2,
        border: '1px solid var(--wpds-color-stroke-surface-neutral)',
        borderRadius: 10,
        padding: '10px 12px',
      }}
    >
      <Text variant="body-sm" style={{ opacity: 0.6 }}>
        {label}
      </Text>
      <Text variant="heading-md">{value}</Text>
    </div>
  );
}
