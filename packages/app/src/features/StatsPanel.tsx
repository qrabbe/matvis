import { useMemo, useState } from 'react';
import { Card, Stack, Text } from '@wordpress/ui';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CoverageMeter } from '../components/CoverageMeter';
import { DateRangePicker } from '../components/DateRangePicker';
import { InlineSpinner } from '../components/InlineSpinner';
import { NoReceipts } from '../components/NoReceipts';
import { SectionCard } from '../components/SectionCard';
import { StatCard } from '../components/StatCard';
import { StatGrid } from '../components/StatGrid';
import { TrendBadge } from '../components/TrendBadge';
import {
  AXIS_PROPS,
  BAR_RADIUS,
  CHART_CHROME,
  PRIMARY_SERIES,
  TOOLTIP_STYLE,
} from '../components/chartTheme';
import type { PurchaseData } from '../hooks/usePurchaseData';
import {
  precedingRange,
  presetRange,
  type DateRange,
  type RangePresetId,
} from '../lib/dateRange';
import { formatKr } from '../lib/format';
import {
  headersInRange,
  headlineStats,
  monthlySpend,
  relativeChange,
} from '../lib/stats';

/**
 * Headline tiles plus spend by month.
 *
 * Almost entirely header-derived, so **most of this works today**.
 * `discountsTotal` in particular is already on the receipt header, which means
 * the discount tile needs no line items at all — the one thing here that waits
 * on matching is the coverage meter, and that is honest about itself.
 */
export function StatsPanel({ data }: { data: PurchaseData }) {
  const [preset, setPreset] = useState<RangePresetId | null>('90d');
  const [range, setRange] = useState<DateRange>(() => presetRange('90d'));

  const earliest = useMemo(
    () => headlineStats(data.headers).firstDay ?? undefined,
    [data.headers],
  );

  const current = useMemo(
    () => headlineStats(headersInRange(data.headers, range)),
    [data.headers, range],
  );
  const previous = useMemo(
    () => headlineStats(headersInRange(data.headers, precedingRange(range))),
    [data.headers, range],
  );

  const months = useMemo(
    () => monthlySpend(headersInRange(data.headers, range)),
    [data.headers, range],
  );

  if (data.loadingHeaders) {
    return (
      <Card.Root>
        <Card.Content>
          <InlineSpinner label="Loading receipts…" />
        </Card.Content>
      </Card.Root>
    );
  }

  if (data.headers.length === 0) {
    return (
      <Card.Root>
        <Card.Content>
          <NoReceipts>
            Link a store and sync in the connector portal. Everything on this
            tab is derived from receipt totals, so it fills in as soon as the
            first receipt lands.
          </NoReceipts>
        </Card.Content>
      </Card.Root>
    );
  }

  return (
    <Stack direction="column" gap="xl">
      <DateRangePicker
        range={range}
        onChange={(next) => {
          setRange(next);
          setPreset(null);
        }}
        earliest={earliest}
        activePreset={preset}
        onPresetChange={setPreset}
      />

      <StatGrid>
        <StatCard
          label="Receipts"
          value={current.receipts.toLocaleString('sv-SE')}
          sub={`${range.from} → ${range.to}`}
          trend={
            <TrendBadge
              change={relativeChange(current.receipts, previous.receipts)}
            />
          }
        />
        <StatCard
          label="Items bought"
          value={current.items.toLocaleString('sv-SE')}
          sub="As printed on the receipts"
        />
        <StatCard
          label="Spend"
          value={formatKr(current.spend)}
          trend={
            <TrendBadge
              change={relativeChange(current.spend, previous.spend)}
            />
          }
        />
        <StatCard
          label="Average basket"
          value={formatKr(current.averageBasket)}
          trend={
            <TrendBadge
              change={relativeChange(
                current.averageBasket,
                previous.averageBasket,
              )}
            />
          }
        />
        <StatCard
          label="Discounts saved"
          value={formatKr(current.discounts)}
          sub="From the receipt’s own rebate line"
        />
      </StatGrid>

      <SectionCard title="Spend by month">
        {months.length === 0 ? (
          <Text variant="body-sm">No purchases in the selected range.</Text>
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              {/* Single series, so no legend — the card title names it. */}
              <BarChart
                data={months}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  stroke={CHART_CHROME.grid}
                  vertical={false}
                  strokeDasharray="3 3"
                />
                <XAxis dataKey="month" {...AXIS_PROPS} />
                <YAxis
                  {...AXIS_PROPS}
                  width={56}
                  tickFormatter={(value: number) =>
                    value.toLocaleString('sv-SE')
                  }
                />
                <RechartsTooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [formatKr(Number(value)), 'Spend']}
                />
                <Bar
                  dataKey="total"
                  fill={PRIMARY_SERIES}
                  radius={BAR_RADIUS}
                  maxBarSize={44}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Product coverage">
        <Stack direction="column" gap="md">
          <CoverageMeter coverage={data.coverage} />
          <Text variant="body-sm">
            Nothing fills the receipt-text → EAN map yet, so this is expected to
            read close to zero. The Unmapped tab breaks the gap down.
          </Text>
        </Stack>
      </SectionCard>
    </Stack>
  );
}
