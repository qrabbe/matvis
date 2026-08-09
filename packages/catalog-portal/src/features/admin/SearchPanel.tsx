import { useQuery } from 'convex/react';
import { Badge, Card, EmptyState, Stack, Text } from '@wordpress/ui';
import { SkeletonList } from '@matvis/ui';
import { adminApi } from '../../lib/adminApi';
import { formatAge, formatCount } from './format';

export function SearchPanel({ token }: { token: string }) {
  const stats = useQuery(adminApi.admin.searchStats, { token });

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Search</Card.Title>
      </Card.Header>
      <Card.Content>
        {stats === undefined ? (
          <SkeletonList label="Loading searches…" rows={4} />
        ) : stats === null || stats.sampled === 0 ? (
          <EmptyState.Root>
            <EmptyState.Title>No searches yet</EmptyState.Title>
            <EmptyState.Description>
              Terms are recorded once each, when someone stops typing and the
              results arrive.
            </EmptyState.Description>
          </EmptyState.Root>
        ) : (
          <Stack direction="column" gap="xl">
            <Stack direction="column" gap="sm">
              <Stack direction="row" gap="xl" wrap="wrap">
                <Figure label="Searches" value={formatCount(stats.sampled)} />
                <Figure label="Visitors" value={formatCount(stats.visitors)} />
                <Figure
                  label="Found nothing"
                  value={`${percent(stats.zeroResults, stats.sampled)}`}
                />
              </Stack>
              {/* The window, out loud. A number without it gets remembered as
                  all-time. */}
              <Text variant="body-sm">
                {stats.oldestAt === null
                  ? `The last ${formatCount(stats.sampled)} searches.`
                  : `The last ${formatCount(stats.sampled)} searches, oldest ${formatAge(stats.oldestAt)}.`}
              </Text>
            </Stack>

            <Stack direction="column" gap="sm">
              <Text variant="body-sm">
                <strong>Top terms.</strong> A term that has never returned
                anything is a product the catalog should have and does not,
                which makes it the most actionable row here.
              </Text>
              <Stack direction="column" gap="xs">
                {stats.top.map((row) => (
                  <Stack
                    key={row.term}
                    direction="row"
                    gap="md"
                    align="baseline"
                    wrap="wrap"
                  >
                    <Text variant="body-md">{row.term}</Text>
                    <Text variant="body-sm">{formatCount(row.count)}×</Text>
                    {row.zeroResults === row.count && (
                      <Badge intent="high">never found anything</Badge>
                    )}
                    <Text variant="body-sm">{formatAge(row.lastAt)}</Text>
                  </Stack>
                ))}
              </Stack>
            </Stack>

            <Stack direction="column" gap="sm">
              <Text variant="body-sm">
                <strong>Recent.</strong>
              </Text>
              <Stack direction="column" gap="xs">
                {stats.recent.map((row, index) => (
                  <Stack
                    key={`${row.term}-${row.at}-${index}`}
                    direction="row"
                    gap="md"
                    align="baseline"
                    wrap="wrap"
                  >
                    <Text variant="body-md">{row.term}</Text>
                    <Text variant="body-sm">{formatAge(row.at)}</Text>
                    <Text variant="body-sm">
                      {formatCount(row.results)} result(s)
                    </Text>
                    <Text variant="body-sm">{row.visitor || '—'}</Text>
                  </Stack>
                ))}
              </Stack>
            </Stack>
          </Stack>
        )}
      </Card.Content>
    </Card.Root>
  );
}

function percent(part: number, whole: number): string {
  if (whole <= 0) return '—';
  return `${((part / whole) * 100).toFixed(0)}%`;
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="column" gap="xs" style={{ minWidth: 120 }}>
      <Text variant="body-sm">{label}</Text>
      <Text variant="heading-md">{value}</Text>
    </Stack>
  );
}
