import { useMemo, useState } from 'react';
import { Button, Card, EmptyState, Stack, Text } from '@wordpress/ui';
import { Heatmap } from '../components/Heatmap';
import { InlineSpinner } from '../components/InlineSpinner';
import type { PurchaseData } from '../hooks/usePurchaseData';
import { formatKr } from '../lib/format';
import { dailySpend } from '../lib/stats';

/**
 * The contribution-style spend calendar.
 *
 * Header-derived, with no product join anywhere in it, so **this tab is complete
 * today** — unlike Pantry and Nutrition, which wait on a matching engine. That
 * is also why it sits early in the tab order.
 */
const MONTH_OPTIONS = [3, 6, 12] as const;

export function ActivityPanel({ data }: { data: PurchaseData }) {
  const [months, setMonths] = useState<number>(6);
  const spendByDay = useMemo(() => dailySpend(data.headers), [data.headers]);

  const busiest = useMemo(() => {
    let best: { day: string; total: number } | null = null;
    for (const entry of spendByDay.values()) {
      if (!best || entry.total > best.total) {
        best = { day: entry.day, total: entry.total };
      }
    }
    return best;
  }, [spendByDay]);

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Shopping activity</Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack direction="column" gap="lg">
          <Stack
            direction="row"
            gap="md"
            justify="space-between"
            align="center"
            wrap="wrap"
          >
            <Text variant="body-sm">
              Brightness is that day’s spend, on a log₂ scale — so 10 → 100 kr
              is the same visual step as 100 → 1 000 kr.
            </Text>
            <Stack direction="row" gap="xs">
              {MONTH_OPTIONS.map((option) => (
                <Button
                  key={option}
                  size="compact"
                  variant={months === option ? 'solid' : 'outline'}
                  tone={months === option ? 'brand' : 'neutral'}
                  onClick={() => setMonths(option)}
                >
                  {`${option}m`}
                </Button>
              ))}
            </Stack>
          </Stack>

          {data.loadingHeaders ? (
            <InlineSpinner label="Loading receipts…" />
          ) : data.headers.length === 0 ? (
            <EmptyState.Root>
              <EmptyState.Title>No receipts yet</EmptyState.Title>
              <EmptyState.Description>
                Link a store and sync in the connector portal — receipts appear
                here live as they land.
              </EmptyState.Description>
            </EmptyState.Root>
          ) : (
            <>
              <Heatmap spendByDay={spendByDay} months={months} />
              <Stack direction="row" gap="lg" wrap="wrap">
                <Text variant="body-sm">
                  {`${spendByDay.size} shopping ${spendByDay.size === 1 ? 'day' : 'days'} on record`}
                </Text>
                {busiest && (
                  <Text variant="body-sm">
                    {`Biggest day: ${busiest.day}, ${formatKr(busiest.total)}`}
                  </Text>
                )}
              </Stack>
            </>
          )}
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}
