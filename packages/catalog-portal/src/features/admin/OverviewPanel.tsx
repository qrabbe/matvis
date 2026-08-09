import { useAction, useQuery } from 'convex/react';
import { Badge, Button, Card, Stack, Text } from '@wordpress/ui';
import { SkeletonList } from '@matvis/ui';
import { STORE_LABELS } from '@matvis/shared';
import { adminApi, type Overview } from '../../lib/adminApi';
import { api } from '../../lib/convexApi';
import { formatCount } from './format';
import { TaskResult, useAdminTask } from './task';

export function OverviewPanel({
  overview,
  token,
}: {
  overview: Overview;
  token: string;
}) {
  const { queue, fill, freshness } = overview;
  // The per-store breakdown is the same public query the site header reads,
  // rather than a second copy of the same counters behind the session gate.
  const health = useQuery(api.catalog.health, {});
  const rebuildCounters = useAction(adminApi.admin.rebuildCounters);
  const { state, run } = useAdminTask();

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

          <Stack direction="column" gap="sm">
            <Text variant="body-sm">
              Rows per store. A chain at zero is one nothing has been ingested
              for yet, not one that does not exist.
            </Text>
            {health === undefined ? (
              <SkeletonList label="Loading store counts…" rows={2} />
            ) : (
              <Stack direction="row" gap="xl" wrap="wrap">
                {[...health.stores]
                  .sort((a, b) => b.count - a.count)
                  .map((row) => (
                    <Stat
                      key={row.store}
                      label={STORE_LABELS[row.store]}
                      value={formatCount(row.count)}
                    />
                  ))}
              </Stack>
            )}
          </Stack>
          <Stack direction="column" gap="sm">
            <Text variant="body-sm">
              What the queue is holding. There is no done count and no failed
              count: a stored row leaves the queue, and a failed one goes back
              to pending for the next run.
            </Text>
            <Stack direction="row" gap="xl" wrap="wrap">
              <Stat label="Pending" value={formatCount(queue.pending)} />
              <Stat label="Processing" value={formatCount(queue.processing)} />
              <Stat
                label="Skipped"
                value={formatCount(queue.skipped)}
                note="barcodes the store returned nothing for, remembered so the sweep does not queue them again"
              />
            </Stack>
          </Stack>
          <Stack direction="row" gap="xl" wrap="wrap">
            <Stat
              label="EANs known"
              value={formatCount(fill.eansKnown)}
              note="the target set the fill sweep works through"
            />
            <Stat
              label="Fill sweep"
              value={
                fill.cursorAtEnd ? 'at the start of a fresh pass' : 'mid pass'
              }
              note="where the persisted cursor sits. A deployment that has never run a fill reads the same way, because both are a null cursor"
            />
          </Stack>

          <Stack direction="column" gap="sm">
            <Text variant="body-sm">
              How much of the catalog has ever been checked against Coop.
              Nothing runs on a schedule, so this only moves when you move it.
            </Text>
            <Stack direction="row" gap="xl" wrap="wrap">
              <Stat
                label="Verified"
                value={formatCount(freshness.verified)}
                note="rows carrying a fetch timestamp"
              />
              <Stat
                label="Never fetched"
                value={formatCount(freshness.never)}
                note="written before the timestamp existed, and not re-read since"
              />
            </Stack>
            <Text variant="body-sm">
              {`Age of the ${freshness.sample.size.toLocaleString()} most recently added rows. A sample, and one biased toward new rows, because bucketing the whole table by age is a scan.`}
            </Text>
            <Stack direction="row" gap="xl" wrap="wrap">
              <Stat
                label="Past week"
                value={formatCount(freshness.sample.week)}
              />
              <Stat
                label="Past month"
                value={formatCount(freshness.sample.month)}
              />
              <Stat label="Older" value={formatCount(freshness.sample.older)} />
              <Stat label="Never" value={formatCount(freshness.sample.never)} />
            </Stack>
          </Stack>

          <Stack direction="column" gap="sm">
            <Text variant="body-sm">
              Every number above is maintained on write, not counted on read, so
              it can drift. Rebuilding recounts both tables and overwrites them.
              Pause ingest first, or it is refused.
            </Text>
            <Stack direction="row" gap="md" align="center" wrap="wrap">
              <Button
                variant="outline"
                tone="neutral"
                onClick={() =>
                  run(async () => {
                    const result = await rebuildCounters({ token });
                    return `Recounted ${result.pages} page(s): ${result.catalog?.total ?? 0} catalog row(s), ${result.catalog?.eans ?? 0} EAN(s).`;
                  })
                }
              >
                Rebuild counters
              </Button>
            </Stack>
            <TaskResult state={state} busyLabel="Recounting…" />
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
