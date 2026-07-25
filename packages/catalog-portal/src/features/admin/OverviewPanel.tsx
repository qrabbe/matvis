import { Badge, Card, Stack, Text } from '@wordpress/ui';
import type { Overview } from '../../lib/adminApi';
import { formatAge, formatCount } from './format';

/**
 * The numbers the console exists to show, from one live query. A drain running
 * in the background moves them on their own, which is most of what this has over
 * reading JSON back from `bunx convex run`.
 *
 * Counts stop at a ceiling per status and render as "1000+" when they hit it.
 * The job here is to show that pending is draining, not that it is exactly 4,162.
 */
export function OverviewPanel({ overview }: { overview: Overview }) {
  const { queue, freshness } = overview;
  const capped = queue.capped;
  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>
          <Stack direction="row" gap="sm" align="center">
            <span>Overview</span>
            {overview.paused && <Badge intent="high">paused</Badge>}
          </Stack>
        </Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack direction="column" gap="lg">
          <Stat
            label="Catalog"
            value={overview.catalogTotal.toLocaleString()}
            note="clean rows across every store"
          />
          <Stack direction="row" gap="xl" wrap="wrap">
            <Stat label="Pending" value={formatCount(queue.pending, capped)} />
            <Stat
              label="Processing"
              value={formatCount(queue.processing, capped)}
            />
            <Stat label="Done" value={formatCount(queue.done, capped)} />
            <Stat label="Skipped" value={formatCount(queue.skipped, capped)} />
            <Stat label="Failed" value={formatCount(queue.failed, capped)} />
          </Stack>
          <Stack direction="row" gap="xl" wrap="wrap">
            <Stat
              label="Never fetched"
              value={formatCount(
                freshness.neverFetched,
                freshness.neverFetchedCapped,
              )}
              note="raw rows with no fetch stamp"
            />
            <Stat
              label="Stalest row"
              value={formatAge(freshness.oldestFetchedAt)}
              note="oldest lastFetchedAt"
            />
          </Stack>
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <Stack direction="column" gap="xs" style={{ minWidth: 120 }}>
      <Text variant="body-sm">{label}</Text>
      <Text variant="heading-md">{value}</Text>
      {note && <Text variant="body-sm">{note}</Text>}
    </Stack>
  );
}
