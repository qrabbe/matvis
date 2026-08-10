import { useState, type ComponentProps } from 'react';
import { useAction, useQuery } from 'convex/react';
import {
  Button,
  Card,
  EmptyState,
  InputControl,
  SelectControl,
  Stack,
  Text,
} from '@wordpress/ui';
import { SkeletonList } from '@matvis/ui';
import { STORE_LABELS } from '@matvis/shared';
import { QUEUE_MAINTENANCE_LIMIT, type IngestLane } from '@matvis/catalog';
import { adminApi, type QueueRow, type QueueStatus } from '../../lib/adminApi';
import { href, productPath } from '../../lib/route';
import { formatAge } from './format';
import { TaskResult, useAdminTask } from './task';

type SelectItem = NonNullable<
  ComponentProps<typeof SelectControl>['items']
>[number];

const STATUS_ITEMS: SelectItem[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Processing', value: 'processing' },
  { label: 'Skipped', value: 'skipped' },
];

export function QueuePanel({
  token,
  store,
}: {
  token: string;
  store: IngestLane;
}) {
  const [status, setStatus] = useState<QueueStatus>('pending');
  const [cursor, setCursor] = useState<string | null>(null);
  const [removeText, setRemoveText] = useState('');

  // A pagination cursor belongs to the lane it was handed out for. Switching
  // lanes while holding one asks for the next page of a list nobody is looking
  // at, so the selection resets it the way changing status does.
  const [shownStore, setShownStore] = useState(store);
  if (shownStore !== store) {
    setShownStore(store);
    setCursor(null);
  }

  const page = useQuery(adminApi.admin.queueRows, {
    token,
    status,
    store,
    cursor,
  });
  const removeQueueRows = useAction(adminApi.admin.removeQueueRows);
  const { state, run } = useAdminTask();

  const selection =
    STATUS_ITEMS.find((item) => item.value === status) ?? STATUS_ITEMS[0]!;

  function selectStatus(next: QueueStatus) {
    setStatus(next);
    setCursor(null);
  }

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>{`Queue — ${STORE_LABELS[store]}`}</Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack direction="column" gap="lg">
          <Stack direction="row" gap="md" align="end" wrap="wrap">
            <div style={{ flex: '0 1 180px' }}>
              <SelectControl
                label="Status"
                items={STATUS_ITEMS}
                value={selection}
                onValueChange={(item) =>
                  selectStatus((item?.value as QueueStatus) ?? 'pending')
                }
              />
            </div>
          </Stack>

          <Text variant="body-sm">
            {`This list is the ${STORE_LABELS[store]} lane only. The counts on the overview are whole-table, so the two disagree whenever another lane holds work.`}
          </Text>

          <Text variant="body-sm">
            The queue holds only work and memos. A row whose product was stored
            is deleted, and one whose fetch failed is back under Pending with
            the error on it, waiting for the next run. Skipped means the store
            returned nothing for that barcode, which is remembered so the sweep
            does not queue it again.
          </Text>

          {page === undefined ? (
            <SkeletonList label="Loading queue…" rows={5} />
          ) : page === null || page.rows.length === 0 ? (
            <EmptyState.Root>
              <EmptyState.Title>Nothing {status}</EmptyState.Title>
              <EmptyState.Description>
                {`No ${STORE_LABELS[store]} queue rows are in this state.`}
              </EmptyState.Description>
            </EmptyState.Root>
          ) : (
            <Stack direction="column" gap="md">
              {page.rows.map((row) => (
                <QueueLine key={row._id} row={row} />
              ))}
            </Stack>
          )}

          <Stack direction="row" gap="md" align="center" wrap="wrap">
            {cursor !== null && (
              <Button
                variant="outline"
                tone="neutral"
                onClick={() => setCursor(null)}
              >
                Back to newest
              </Button>
            )}
            {page && !page.isDone && (
              <Button
                variant="outline"
                tone="neutral"
                onClick={() => setCursor(page.continueCursor)}
              >
                Next page
              </Button>
            )}
          </Stack>

          <Stack direction="row" gap="md" align="end" wrap="wrap">
            <div style={{ flex: '1 1 240px' }}>
              <InputControl
                label="Remove rows"
                description={`Every ${STORE_LABELS[store]} queue row for one EAN, up to ${QUEUE_MAINTENANCE_LIMIT.toLocaleString()}. The way to stop a barcode that fails forever, since failures requeue themselves.`}
                placeholder="7311312009203"
                value={removeText}
                onValueChange={(value) => setRemoveText(value)}
              />
            </div>
            <Button
              variant="outline"
              tone="neutral"
              disabled={removeText.trim().length === 0}
              onClick={() =>
                run(async () => {
                  const result = await removeQueueRows({
                    token,
                    store,
                    ean: removeText.trim(),
                  });
                  setRemoveText('');
                  return `Deleted ${result.deleted} ${STORE_LABELS[store]} queue row(s).`;
                })
              }
            >
              Remove
            </Button>
          </Stack>

          <TaskResult state={state} />
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

function QueueLine({ row }: { row: QueueRow }) {
  return (
    <Stack direction="column" gap="xs">
      <Stack direction="row" gap="sm" align="center" wrap="wrap">
        <Text
          variant="body-md"
          render={
            <a href={href(productPath(row.ean))} style={{ color: 'inherit' }} />
          }
        >
          {row.ean}
        </Text>
        <Text variant="body-sm">
          {row.attempts} attempt(s), from {row.source}
        </Text>
        <Text variant="body-sm">
          {formatAge(row.processedAt ?? row.enqueuedAt)}
        </Text>
      </Stack>
      {row.lastError && <Text variant="body-sm">{row.lastError}</Text>}
    </Stack>
  );
}
