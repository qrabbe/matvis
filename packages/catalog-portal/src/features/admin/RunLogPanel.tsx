import { useQuery } from 'convex/react';
import { Badge, Card, EmptyState, Stack, Text } from '@wordpress/ui';
import { InlineSpinner } from '@matvis/ui';
import { adminApi, type RunRow } from '../../lib/adminApi';
import { formatAge, formatDuration, formatSummary } from './format';

/**
 * The last runs, newest first.
 *
 * One row per action INVOCATION, not per thing a human started: `processQueue`
 * and `refreshOldest` schedule their own continuations, so a drain of 4,000 rows
 * reads as nine rows here. That is the log being honest about what ran rather
 * than a tree nobody asked for.
 *
 * A row still reading `running` long after it started is an invocation that died
 * without settling, which a wall-clock timeout or a deploy will do.
 */
export function RunLogPanel({ token }: { token: string }) {
  const runs = useQuery(adminApi.admin.runs, { token });

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Run log</Card.Title>
      </Card.Header>
      <Card.Content>
        {runs === undefined ? (
          <InlineSpinner label="Loading runs…" />
        ) : runs === null || runs.length === 0 ? (
          <EmptyState.Root>
            <EmptyState.Title>No runs yet</EmptyState.Title>
            <EmptyState.Description>
              Start discovery or a drain above and it will show up here.
            </EmptyState.Description>
          </EmptyState.Root>
        ) : (
          <Stack direction="column" gap="md">
            {runs.map((run) => (
              <RunLine key={run._id} run={run} />
            ))}
          </Stack>
        )}
      </Card.Content>
    </Card.Root>
  );
}

/** Badge colour by outcome. `paused` is informational rather than a warning:
 * the run did exactly what it was told. */
function statusIntent(status: RunRow['status']) {
  if (status === 'error') return 'high' as const;
  if (status === 'ok') return 'stable' as const;
  if (status === 'running') return 'informational' as const;
  return 'draft' as const;
}

function RunLine({ run }: { run: RunRow }) {
  const summary = formatSummary(run.summary);
  return (
    <Stack direction="column" gap="xs">
      <Stack direction="row" gap="sm" align="center" wrap="wrap">
        <Badge intent={statusIntent(run.status)}>{run.status}</Badge>
        <Text variant="body-md">{run.kind}</Text>
        <Text variant="body-sm">{formatAge(run.startedAt)}</Text>
        <Text variant="body-sm">
          {formatDuration(run.startedAt, run.finishedAt)}
        </Text>
      </Stack>
      {summary && <Text variant="body-sm">{summary}</Text>}
      {run.error && <Text variant="body-sm">{run.error}</Text>}
    </Stack>
  );
}
