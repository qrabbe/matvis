import { useState } from 'react';
import { Badge, Button, EmptyState, Link, Stack, Text } from '@wordpress/ui';
import { SectionCard } from '../components/SectionCard';
import { appBackendApi } from '../lib/appBackendApi';
import { appBackendClient } from '../lib/appBackendClient';
import { clearCachedItems } from '../lib/itemCache';
import { PROTEIN_GOAL_G } from '../lib/nutrition';

export function PreferencesPanel({
  token,
  onForgetToken,
}: {
  token: string;
  onForgetToken: () => void;
}) {
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const forget = async () => {
    setClearing(true);
    try {
      await clearCachedItems();
      onForgetToken();
    } finally {
      setClearing(false);
    }
  };

  const exportData = async () => {
    const client = appBackendClient();
    if (!client) return;
    setExporting(true);
    setExportError(null);
    try {
      const data = await client.query(appBackendApi.consumption.exportAll, {
        token,
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'matvis-consumption-log.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Could not export — try again.');
    } finally {
      setExporting(false);
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

      <SectionCard title="Your consumption log">
        <Stack direction="column" gap="md">
          <Text variant="body-md">
            Every "used" you've logged and every product you've excluded,
            exactly as stored — plain facts, not a matvis-specific format.
            Nothing here is tied to a receipt line, so it still makes sense
            outside this app.
          </Text>
          <Stack direction="row" gap="sm" align="center">
            <Button loading={exporting} onClick={() => void exportData()}>
              Export as JSON
            </Button>
            {exportError && (
              <Text
                variant="body-sm"
                style={{
                  color: 'var(--wpds-color-foreground-content-critical, #d33)',
                }}
              >
                {exportError}
              </Text>
            )}
          </Stack>
        </Stack>
      </SectionCard>

      <SectionCard title="Preferences">
        <EmptyState.Root>
          <EmptyState.Title>Nothing to configure yet</EmptyState.Title>
          <EmptyState.Description>
            {`Planned for here: a protein goal (currently a fixed ${PROTEIN_GOAL_G} g placeholder), a default date range, and a store filter. Each of those is a constant in the code today, so this tab is where they become yours.`}
          </EmptyState.Description>
        </EmptyState.Root>
      </SectionCard>
    </Stack>
  );
}
