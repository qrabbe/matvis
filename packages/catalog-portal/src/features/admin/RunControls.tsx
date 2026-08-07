import { useState } from 'react';
import { useMutation } from 'convex/react';
import { Button, Card, InputControl, Stack, Text } from '@wordpress/ui';
import { adminApi } from '../../lib/adminApi';
import { TaskResult, useAdminTask } from './task';

const DEFAULT_DRAIN_BATCHES = 4;
const DEFAULT_FILL_BATCHES = 8;

export function RunControls({
  token,
  paused,
}: {
  token: string;
  paused: boolean;
}) {
  const startDrain = useMutation(adminApi.admin.startDrain);
  const startFill = useMutation(adminApi.admin.startFill);
  const setPaused = useMutation(adminApi.admin.setPaused);

  const [drainBatches, setDrainBatches] = useState(
    String(DEFAULT_DRAIN_BATCHES),
  );
  const [fillBatches, setFillBatches] = useState(String(DEFAULT_FILL_BATCHES));
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
              Fill walks the known EANs and queues whatever the catalog has no
              row for. Drain fetches what is queued. New barcodes come from the
              local census script, not from here.
            </Text>
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
                label="Fill batches"
                type="number"
                value={fillBatches}
                onValueChange={(value) => setFillBatches(value)}
              />
            </div>
            <Button
              onClick={() =>
                run(async () => {
                  const result = await startFill({
                    token,
                    batches: Number(fillBatches),
                  });
                  return `Fill sweep scheduled for ${result.batches} batch(es).`;
                })
              }
            >
              Fill missing
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
