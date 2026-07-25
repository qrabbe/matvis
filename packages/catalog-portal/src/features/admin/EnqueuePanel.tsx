import { useState } from 'react';
import { useAction } from 'convex/react';
import {
  Button,
  Card,
  Field,
  InputControl,
  Stack,
  Text,
  Textarea,
} from '@wordpress/ui';
import { adminApi } from '../../lib/adminApi';
import { TaskResult, useAdminTask } from './task';

/**
 * Put work into the queue by hand: a pasted list of EANs, or one search phrase.
 *
 * The `queued` / `known` / `duplicate` breakdown that comes back explains
 * itself. `known` is already in the catalog and belongs to the refresh sweep,
 * `duplicate` already has a queue row that has not settled, and only `queued` is
 * new work.
 */
export function EnqueuePanel({ token }: { token: string }) {
  const enqueueEans = useAction(adminApi.admin.enqueueEans);
  const enqueueName = useAction(adminApi.admin.enqueueName);
  const [eanText, setEanText] = useState('');
  const [nameText, setNameText] = useState('');
  const { state, run } = useAdminTask();

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Add to queue</Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack direction="column" gap="lg">
          <Stack direction="column" gap="sm">
            <Field.Root>
              <Field.Label>EANs</Field.Label>
              <Field.Description>
                One per line, or separated by commas or spaces.
              </Field.Description>
              <Textarea
                rows={5}
                value={eanText}
                onValueChange={(value) => setEanText(value)}
              />
            </Field.Root>
            <Stack direction="row" gap="md" align="center" wrap="wrap">
              <Button
                disabled={parseEans(eanText).length === 0}
                onClick={() =>
                  run(async () => {
                    const eans = parseEans(eanText);
                    const result = await enqueueEans({ token, eans });
                    setEanText('');
                    return `${eans.length} EAN(s): ${result.queued} queued, ${result.known} already in the catalog, ${result.duplicate} already queued.`;
                  })
                }
              >
                Queue EANs
              </Button>
              <Text variant="body-sm">
                {parseEans(eanText).length} recognised
              </Text>
            </Stack>
          </Stack>

          <Stack direction="row" gap="md" align="end" wrap="wrap">
            <div style={{ flex: '1 1 260px' }}>
              <InputControl
                label="Search phrase"
                description="Resolved through Coop search. Every hit is ingested."
                placeholder="tabasco röd"
                value={nameText}
                onValueChange={(value) => setNameText(value)}
              />
            </div>
            <Button
              disabled={nameText.trim().length === 0}
              onClick={() =>
                run(async () => {
                  const query = nameText.trim();
                  const result = await enqueueName({ token, query });
                  setNameText('');
                  return result.status === 'queued'
                    ? `Queued "${query}".`
                    : `"${query}" is already queued.`;
                })
              }
            >
              Queue phrase
            </Button>
          </Stack>

          <TaskResult state={state} busyLabel="Queueing…" />
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

/** Every digit run in the pasted text, deduped and in order. Deliberately
 * permissive about separators, since the list is usually pasted from somewhere
 * that formatted it its own way. */
function parseEans(text: string): string[] {
  return [...new Set(text.match(/\d{8,14}/g) ?? [])];
}
