import { useState } from 'react';
import { useAction } from 'convex/react';
import { Button, Card, Field, Stack, Text, Textarea } from '@wordpress/ui';
import { adminApi } from '../../lib/adminApi';
import { TaskResult, useAdminTask } from './task';

export function EnqueuePanel({ token }: { token: string }) {
  const enqueueEans = useAction(adminApi.admin.enqueueEans);
  const [eanText, setEanText] = useState('');
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

          <TaskResult state={state} busyLabel="Queueing…" />
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

function parseEans(text: string): string[] {
  return [...new Set(text.match(/\d{8,14}/g) ?? [])];
}
