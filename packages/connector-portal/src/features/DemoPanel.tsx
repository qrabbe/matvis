import { useState } from 'react';
import { Button, Card, Input, Notice, Stack, Text } from '@wordpress/ui';
import { ConnectionsPanel } from './ConnectionsPanel';
import { ReceiptsPanel } from './ReceiptsPanel';

/** Must never read through the login session. The whole point of this tab is
 * that the receipts below load through the pasted token alone. */
export function DemoPanel() {
  const [draft, setDraft] = useState('');
  const [active, setActive] = useState<string | null>(null);

  const submit = () => {
    const trimmed = draft.trim();
    setActive(trimmed === '' ? null : trimmed);
  };

  return (
    <Stack direction="column" gap="xl">
      <Card.Root>
        <Card.Header>
          <Card.Title>Try a token</Card.Title>
        </Card.Header>
        <Card.Content>
          <Stack direction="column" gap="md">
            <Text variant="body-md">
              Paste a token from the <strong>Connect</strong> tab. The linked
              stores and receipts below then load through that token alone —
              this tab never touches your login session, so it&rsquo;s exactly
              what a third-party service sees with the token you give it.
            </Text>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <Stack direction="row" gap="sm" align="center" wrap="wrap">
                <Input
                  value={draft}
                  onValueChange={setDraft}
                  placeholder="mvk_…"
                  style={{ flex: 1, minWidth: 240 }}
                />
                <Button type="submit" variant="solid">
                  Fetch
                </Button>
              </Stack>
            </form>
          </Stack>
        </Card.Content>
      </Card.Root>

      {active === null ? (
        <Notice.Root intent="info">
          <Notice.Description>
            Paste a token and hit “Fetch” to load its stores and receipts here.
          </Notice.Description>
        </Notice.Root>
      ) : (
        <>
          <ConnectionsPanel token={active} />
          <ReceiptsPanel token={active} />
        </>
      )}
    </Stack>
  );
}
