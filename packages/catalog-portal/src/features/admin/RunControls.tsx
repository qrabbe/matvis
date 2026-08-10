import { useState } from 'react';
import { useMutation } from 'convex/react';
import { Button, Card, InputControl, Stack, Text } from '@wordpress/ui';
import { STORE_LABELS } from '@matvis/shared';
import { type IngestLane } from '@matvis/catalog';
import { adminApi } from '../../lib/adminApi';
import { TaskResult, useAdminTask } from './task';

const DEFAULT_BATCHES = 4;

export function RunControls({
  token,
  store,
  paused,
}: {
  token: string;
  store: IngestLane;
  paused: boolean;
}) {
  const startRun = useMutation(adminApi.admin.startRun);
  const setPaused = useMutation(adminApi.admin.setPaused);

  const [batches, setBatches] = useState(String(DEFAULT_BATCHES));
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
              {`One run walks the ${STORE_LABELS[store]} lane's known EANs, queues whatever the catalog has no row for, then fetches what is queued. New barcodes come from the local census script, not from here.`}
            </Text>
            <Text variant="body-sm">
              Rows that fail go back in the queue with the error on them, so the
              next run picks them up. Nothing needs requeueing by hand, and a
              row whose product was stored leaves the queue for good.
            </Text>
          </Stack>

          <Stack direction="row" gap="md" align="end" wrap="wrap">
            <div style={{ flex: '0 1 140px' }}>
              <InputControl
                label="Batches"
                type="number"
                value={batches}
                onValueChange={(value) => setBatches(value)}
              />
            </div>
            <Button
              onClick={() =>
                run(async () => {
                  const result = await startRun({
                    token,
                    store,
                    batches: Number(batches),
                  });
                  return `${STORE_LABELS[store]} run scheduled for ${result.batches} batch(es).`;
                })
              }
            >
              {`Run ${STORE_LABELS[store]}`}
            </Button>
          </Stack>

          <Stack direction="column" gap="sm">
            <Text variant="body-sm">
              Pause is re-read between batches, so a running fetch stops within
              one batch and a running sweep within one page. It is the only
              thing that can stop a chain that schedules itself. A run stopped
              this way is logged as paused and keeps what it got through.
            </Text>
            <Text variant="body-sm">
              Pause is one flag for the deployment, not one per lane, so it
              stops whichever run is going regardless of what this select says.
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
