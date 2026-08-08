import { useQuery } from 'convex/react';
import { Card, EmptyState, Stack, Text } from '@wordpress/ui';
import { SkeletonList } from '@matvis/ui';
import { adminApi, type RunPoint } from '../../lib/adminApi';
import { formatAge, formatCount } from './format';

const PLOT_HEIGHT = 96;
const BAR_WIDTH = 14;

/** One bar per drain, oldest on the left. Not a date axis: runs are started by
 * hand, so they arrive in clusters with days of nothing between them, and
 * spacing them by time would spend most of the width drawing the gaps. Per run
 * is the honest axis while nothing is scheduled. */
export function RunTrendPanel({ token }: { token: string }) {
  const history = useQuery(adminApi.admin.runHistory, { token });

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Products added per run</Card.Title>
      </Card.Header>
      <Card.Content>
        {history === undefined ? (
          <SkeletonList label="Loading run history…" rows={3} />
        ) : history === null || history.length === 0 ? (
          <EmptyState.Root>
            <EmptyState.Title>No drains yet</EmptyState.Title>
            <EmptyState.Description>
              This plots what each drain added. Fills are left out, because a
              fill queues work and never adds a product.
            </EmptyState.Description>
          </EmptyState.Root>
        ) : (
          <Trend history={history} />
        )}
      </Card.Content>
    </Card.Root>
  );
}

function Trend({ history }: { history: RunPoint[] }) {
  const peak = Math.max(...history.map((run) => run.added), 1);
  const total = history.reduce((sum, run) => sum + run.added, 0);
  const latest = history[history.length - 1]!;

  return (
    <Stack direction="column" gap="lg">
      <Stack direction="row" gap="xl" wrap="wrap">
        <Figure label="Added, these runs" value={formatCount(total)} />
        <Figure label="Runs plotted" value={formatCount(history.length)} />
        <Figure label="Most in one run" value={formatCount(peak)} />
      </Stack>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 2,
          height: PLOT_HEIGHT,
          overflowX: 'auto',
          // The one rule the eye needs: the baseline is zero, so a short bar
          // means a run that found almost nothing rather than a small scale.
          borderBottom: '1px solid var(--wpds-color-stroke-surface, #403a3a)',
          paddingBottom: 1,
        }}
      >
        {history.map((run, index) => (
          <Bar key={`${run.startedAt}-${index}`} run={run} peak={peak} />
        ))}
      </div>

      <Text variant="body-sm">
        {`Oldest on the left, newest on the right. Tallest bar is ${formatCount(peak)}. Last drain ${formatAge(latest.startedAt)} added ${formatCount(latest.added)}.`}
      </Text>
    </Stack>
  );
}

function Bar({ run, peak }: { run: RunPoint; peak: number }) {
  // A run that added nothing still gets a visible sliver, so "ran and found
  // nothing" is distinguishable from "did not run".
  const height = Math.max((run.added / peak) * (PLOT_HEIGHT - 2), 2);
  const troubled = run.status === 'error' || run.failed > 0;

  return (
    <div
      title={`${formatAge(run.startedAt)} · ${run.status} · added ${run.added}, skipped ${run.skipped}, failed ${run.failed}, claimed ${run.claimed}`}
      style={{
        width: BAR_WIDTH,
        minWidth: BAR_WIDTH,
        height,
        borderRadius: '4px 4px 0 0',
        background: troubled
          ? 'var(--wpds-color-background-feedback-serious, #cf995d)'
          : 'var(--wpds-color-background-interactive-brand-strong, #89a8e8)',
      }}
    />
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="column" gap="xs" style={{ minWidth: 120 }}>
      <Text variant="body-sm">{label}</Text>
      <Text variant="heading-md">{value}</Text>
    </Stack>
  );
}
