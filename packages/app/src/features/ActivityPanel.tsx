import { useMemo, useState } from 'react';
import { Button, Stack, Text } from '@wordpress/ui';
import { InlineSpinner } from '@matvis/ui';
import { Heatmap } from '../components/Heatmap';
import { NoReceipts } from '../components/NoReceipts';
import { SectionCard } from '../components/SectionCard';
import type { PurchaseData } from '../hooks/usePurchaseData';
import { formatKr } from '../lib/format';
import { dailySpend } from '../lib/stats';

const MONTH_OPTIONS = [3, 6, 12] as const;

export function ActivityPanel({ data }: { data: PurchaseData }) {
  const [months, setMonths] = useState<number>(6);
  const [todayMs] = useState(() => Date.now());
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
    <SectionCard title="Shopping activity">
      <Stack direction="column" gap="lg">
        <Stack
          direction="row"
          gap="md"
          justify="space-between"
          align="center"
          wrap="wrap"
        >
          <Text variant="body-sm">
            Brightness is that day’s spend, on a log₂ scale — so 10 → 100 kr is
            the same visual step as 100 → 1 000 kr.
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
          <NoReceipts />
        ) : (
          <>
            <Heatmap
              spendByDay={spendByDay}
              months={months}
              todayMs={todayMs}
            />
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
    </SectionCard>
  );
}
