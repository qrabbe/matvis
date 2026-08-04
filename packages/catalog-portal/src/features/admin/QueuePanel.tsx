import { useState, type ComponentProps } from 'react';
import { useAction, useQuery } from 'convex/react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  InputControl,
  SelectControl,
  Stack,
  Text,
} from '@wordpress/ui';
import { SkeletonList } from '@matvis/ui';
import { adminApi, type QueueRow, type QueueStatus } from '../../lib/adminApi';
import { href, productPath } from '../../lib/route';
import { formatAge } from './format';
import { TaskResult, useAdminTask } from './task';

/**
 * The queue, one status at a time, defaulting to `failed`.
 *
 * This is the screen the console is worth building for. `lastError` is the only
 * place the reason a row did not ingest is written down, and reading it used to
 * take a hand-written `runOneoffQuery` against the deployment. The
 * `onlinePromotions[].price` type drift was found exactly this way.
 */

/** One `SelectControl` option. The package does not re-export the type, so it is
 * read back off the component's own props. */
type SelectItem = NonNullable<
  ComponentProps<typeof SelectControl>['items']
>[number];

const STATUS_ITEMS: SelectItem[] = [
  { label: 'Failed', value: 'failed' },
  { label: 'Pending', value: 'pending' },
  { label: 'Processing', value: 'processing' },
  { label: 'Skipped', value: 'skipped' },
  { label: 'Done', value: 'done' },
];

export function QueuePanel({ token }: { token: string }) {
  const [status, setStatus] = useState<QueueStatus>('failed');
  // One cursor, not a stack: this is a look at the head of a status, and "next
  // page" resets whenever the status changes.
  const [cursor, setCursor] = useState<string | null>(null);
  const [removeText, setRemoveText] = useState('');

  const page = useQuery(adminApi.admin.queueRows, { token, status, cursor });
  const requeueFailed = useAction(adminApi.admin.requeueFailed);
  const clearDoneRows = useAction(adminApi.admin.clearDoneRows);
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
        <Card.Title>Queue</Card.Title>
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
                  selectStatus((item?.value as QueueStatus) ?? 'failed')
                }
              />
            </div>
            <Button
              variant="outline"
              tone="neutral"
              onClick={() =>
                run(async () => {
                  const result = await requeueFailed({ token });
                  return `Requeued ${result.requeued} failed row(s).`;
                })
              }
            >
              Requeue failed
            </Button>
            <Button
              variant="outline"
              tone="neutral"
              onClick={() =>
                run(async () => {
                  const result = await clearDoneRows({ token });
                  return `Deleted ${result.deleted} done row(s).`;
                })
              }
            >
              Clear done
            </Button>
          </Stack>

          {page === undefined ? (
            <SkeletonList label="Loading queue…" rows={5} />
          ) : page === null || page.rows.length === 0 ? (
            <EmptyState.Root>
              <EmptyState.Title>Nothing {status}</EmptyState.Title>
              <EmptyState.Description>
                No queue rows are in this state.
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
                description="An EAN, or the exact search text of a name row."
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
                  const text = removeText.trim();
                  // Digits are an EAN, anything else is a name row's query text.
                  const result = await removeQueueRows(
                    /^\d+$/.test(text)
                      ? { token, ean: text }
                      : { token, query: text },
                  );
                  setRemoveText('');
                  return `Deleted ${result.deleted} queue row(s).`;
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
        <Badge intent="none">{row.kind}</Badge>
        {row.ean ? (
          <Text
            variant="body-md"
            render={
              <a
                href={href(productPath(row.ean))}
                style={{ color: 'inherit' }}
              />
            }
          >
            {row.ean}
          </Text>
        ) : (
          <Text variant="body-md">{row.query ?? '—'}</Text>
        )}
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
