import { Badge, Card, Stack, Text } from '@wordpress/ui';
import type { Overview } from '../../lib/adminApi';
import { formatAge, formatCount } from './format';

export function OverviewPanel({ overview }: { overview: Overview }) {
  const { queue, freshness } = overview;
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
            <Stat label="Pending" value={formatCount(queue.pending)} />
            <Stat label="Processing" value={formatCount(queue.processing)} />
            <Stat label="Done" value={formatCount(queue.done)} />
            <Stat label="Skipped" value={formatCount(queue.skipped)} />
            <Stat label="Failed" value={formatCount(queue.failed)} />
          </Stack>
          <Stack direction="row" gap="xl" wrap="wrap">
            <Stat
              label="Never fetched"
              value={formatCount(freshness.neverFetched)}
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
