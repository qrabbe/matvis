import { useState } from 'react';
import { useAction } from 'convex/react';
import { Button, Card, Field, Stack, Text, Textarea } from '@wordpress/ui';
import { STORE_LABELS } from '@matvis/shared';
import { ENQUEUE_PASTE_MAX, type IngestLane } from '@matvis/catalog';
import { adminApi } from '../../lib/adminApi';
import { TaskResult, useAdminTask } from './task';

export function EnqueuePanel({
  token,
  store,
}: {
  token: string;
  store: IngestLane;
}) {
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
                {`One per line, or separated by commas or spaces. At most ${ENQUEUE_PASTE_MAX.toLocaleString()} per paste, and a bigger one is refused rather than truncated. They are queued into the ${STORE_LABELS[store]} lane.`}
              </Field.Description>
              <Textarea
                rows={5}
                value={eanText}
                onValueChange={(value) => setEanText(value)}
              />
            </Field.Root>
            {store === 'ica' && (
              <Text variant="body-sm">
                A bare barcode does not address an ICA page: the lane needs the
                product id the census supplies, so a row pasted here is claimed
                and then skipped as having no ICA product id. Pasting is a Coop
                lever. Load ICA from the census script.
              </Text>
            )}
            <Stack direction="row" gap="md" align="center" wrap="wrap">
              <Button
                disabled={parseEans(eanText).length === 0}
                onClick={() =>
                  run(async () => {
                    const eans = parseEans(eanText);
                    const result = await enqueueEans({ token, store, eans });
                    setEanText('');
                    return `${eans.length} EAN(s) into ${STORE_LABELS[store]}: ${result.queued} queued, ${result.known} already in the catalog, ${result.duplicate} already queued.`;
                  })
                }
              >
                {`Queue EANs into ${STORE_LABELS[store]}`}
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
