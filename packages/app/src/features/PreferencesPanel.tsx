import { useState } from 'react';
import { Badge, Button, EmptyState, Link, Stack, Text } from '@wordpress/ui';
import { SectionCard } from '../components/SectionCard';
import { CONSUMPTION_WINDOW_DAYS, PROTEIN_GOAL_G } from '../lib/nutrition';
import { clearCachedItems } from '../lib/itemCache';

export function PreferencesPanel({
  onForgetToken,
}: {
  onForgetToken: () => void;
}) {
  const [clearing, setClearing] = useState(false);

  const forget = async () => {
    setClearing(true);
    try {
      await clearCachedItems();
      onForgetToken();
    } finally {
      setClearing(false);
    }
  };

  return (
    <Stack direction="column" gap="xl">
      <SectionCard title="Access">
        <Stack direction="column" gap="md">
          <Stack direction="row" gap="sm" align="center" wrap="wrap">
            <Badge intent="stable">Token stored</Badge>
            <Badge intent="informational">Read-only</Badge>
          </Stack>
          <Text variant="body-md">
            This browser holds one account API token. It grants read access to
            that account’s receipts and nothing else — the app never opens an
            auth session, so every write path on the connector rejects it before
            it reaches a handler.
          </Text>
          <Text variant="body-sm">
            It is a bearer credential and it survives closing the tab. Forget it
            on a shared machine. Mint a new one any time in the{' '}
            <Link href="../connector/">connector portal</Link>.
          </Text>
          <Stack direction="row" gap="sm">
            <Button
              variant="outline"
              tone="neutral"
              loading={clearing}
              onClick={() => void forget()}
            >
              Forget token and cached receipts
            </Button>
          </Stack>
        </Stack>
      </SectionCard>

      <SectionCard title="Preferences">
        <EmptyState.Root>
          <EmptyState.Title>Nothing to configure yet</EmptyState.Title>
          <EmptyState.Description>
            {`Planned for here: a protein goal (currently a fixed ${PROTEIN_GOAL_G} g placeholder), the consumption window (currently ${CONSUMPTION_WINDOW_DAYS} days), a default date range, and a store filter. Each of those is a constant in the code today, so this tab is where they become yours.`}
          </EmptyState.Description>
        </EmptyState.Root>
      </SectionCard>
    </Stack>
  );
}
