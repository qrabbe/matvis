import { useState } from 'react';
import { useMutation } from 'convex/react';
import { Button, Card, InputControl, Stack, Text } from '@wordpress/ui';
import { adminApi } from '../../lib/adminApi';
import { TaskResult, useAdminTask } from './task';

const DEFAULT_DRAIN_BATCHES = 4;
const DEFAULT_REFRESH_BATCHES = 8;

export function RunControls({
  token,
  paused,
}: {
  token: string;
  paused: boolean;
}) {
  const startDiscovery = useMutation(adminApi.admin.startDiscovery);
  const startDrain = useMutation(adminApi.admin.startDrain);
  const startRefresh = useMutation(adminApi.admin.startRefresh);
  const setPaused = useMutation(adminApi.admin.setPaused);

  const [drainBatches, setDrainBatches] = useState(
    String(DEFAULT_DRAIN_BATCHES),
  );
  const [refreshBatches, setRefreshBatches] = useState(
    String(DEFAULT_REFRESH_BATCHES),
  );
  const { state, run } = useAdminTask();

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Run</Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack direction="column" gap="lg">
          <Stack direction="column" gap="sm">
            <Text variant="body-sm">
              Read Coop&rsquo;s product sitemap and queue every id the catalog
              does not hold yet, then drain what it queued.
            </Text>
            <Stack direction="row" gap="md" align="center" wrap="wrap">
              <Button
                onClick={() =>
                  run(async () => {
                    await startDiscovery({ token, drain: true });
                    return 'Discovery scheduled. Watch the run log.';
                  })
                }
              >
                Run discovery
              </Button>
            </Stack>
          </Stack>

          <Stack direction="row" gap="md" align="end" wrap="wrap">
            <div style={{ flex: '0 1 140px' }}>
              <InputControl
                label="Drain batches"
                type="number"
                value={drainBatches}
                onValueChange={(value) => setDrainBatches(value)}
              />
            </div>
            <Button
              onClick={() =>
                run(async () => {
                  const result = await startDrain({
                    token,
                    batches: Number(drainBatches),
                  });
                  return `Drain scheduled for ${result.batches} batch(es).`;
                })
              }
            >
              Drain queue
            </Button>
            <div style={{ flex: '0 1 140px' }}>
              <InputControl
                label="Refresh batches"
                type="number"
                value={refreshBatches}
                onValueChange={(value) => setRefreshBatches(value)}
              />
            </div>
            <Button
              onClick={() =>
                run(async () => {
                  const result = await startRefresh({
                    token,
                    batches: Number(refreshBatches),
                  });
                  return `Refresh sweep scheduled for ${result.batches} batch(es).`;
                })
              }
            >
              Refresh oldest
            </Button>
          </Stack>

          <Stack direction="column" gap="sm">
            <Text variant="body-sm">
              Pause is checked at the top of every worker batch, so a running
              drain stops within one batch. It is the only thing that can stop a
              chain that schedules itself, and the reason it is safe to turn
              crons on later.
            </Text>
            <Stack direction="row" gap="md" align="center" wrap="wrap">
              <Button
                tone={paused ? 'brand' : 'neutral'}
                variant={paused ? 'solid' : 'outline'}
                onClick={() =>
                  run(async () => {
                    await setPaused({ token, paused: !paused });
                    return paused ? 'Ingest resumed.' : 'Ingest paused.';
                  })
                }
              >
                {paused ? 'Resume ingest' : 'Pause ingest'}
              </Button>
            </Stack>
          </Stack>

          <TaskResult state={state} busyLabel="Scheduling…" />
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}
