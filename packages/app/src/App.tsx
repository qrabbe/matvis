import { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import {
  Badge,
  Button,
  Card,
  InputControl,
  Link,
  Stack,
  Text,
} from '@wordpress/ui';
import { STORE_LABELS } from '@matvis/shared';
import { ErrorNotice, InlineSpinner } from '@matvis/ui';
import { Meter } from './components/Meter';
import { usePurchaseData, type PurchaseData } from './hooks/usePurchaseData';
import { api } from './lib/convexApi';
import { looksLikeToken, useApiToken } from './lib/tokenStore';

// The four tabs (Pantry, Insights, Purchases, Settings) land in the next
// step of the app-ux rebuild — this shell keeps the token gate and load
// status working on their own in the meantime.

export function App() {
  const { token, setToken } = useApiToken();
  const data = usePurchaseData(token);

  return (
    <Stack
      direction="column"
      gap="xl"
      style={{ maxWidth: 980, margin: '0 auto', padding: '48px 20px' }}
    >
      <Header token={token} />

      {!token ? (
        <TokenGate onSubmit={setToken} />
      ) : (
        <>
          <HydrationStatus data={data} />
          {data.error && (
            <ErrorNotice title="Something didn’t load">
              {data.error}
            </ErrorNotice>
          )}
        </>
      )}
    </Stack>
  );
}

function Header({ token }: { token: string | null }) {
  const connections = useQuery(
    api.connections.list,
    token ? { token } : 'skip',
  );

  const summary = useMemo(() => {
    if (!token) return 'Pantry, nutrition and purchase insight';
    if (connections === undefined) return 'Loading…';
    if (connections.length === 0) return 'No stores linked to this token';
    return connections
      .map((connection) => STORE_LABELS[connection.store])
      .join(', ');
  }, [connections, token]);

  return (
    <Stack direction="row" gap="md" justify="space-between" align="start">
      <Stack direction="column" gap="xs">
        <Text variant="heading-xl">Matvis</Text>
        <Text variant="body-md">{summary}</Text>
      </Stack>
      {token && <Badge intent="stable">Read-only</Badge>}
    </Stack>
  );
}

function TokenGate({ onSubmit }: { onSubmit: (token: string) => void }) {
  const [value, setValue] = useState('');

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Connect your receipts</Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack direction="column" gap="md">
          <Text variant="body-md">
            Paste your account API token. Mint one in the{' '}
            <Link href="../connector/">connector portal</Link> under “Connect” —
            that is also where you link a store.
          </Text>
          <InputControl
            label="Account API token"
            description="Stored in this browser only. It grants read access to one account's receipts."
            value={value}
            onValueChange={setValue}
          />
          <Stack direction="row" gap="sm">
            <Button
              disabled={!looksLikeToken(value)}
              onClick={() => onSubmit(value)}
            >
              Use this token
            </Button>
          </Stack>
          <Text variant="body-sm">
            The app can only read. It never opens an auth session, so linking,
            syncing and every other write stay with the portal.
          </Text>
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

function HydrationStatus({ data }: { data: PurchaseData }) {
  const { hydration, loadingHeaders, loadingMoreHeaders } = data;
  const pending = hydration.total > hydration.done;

  if (loadingHeaders) return <InlineSpinner label="Loading receipts…" />;
  if (!pending) {
    return loadingMoreHeaders ? (
      <InlineSpinner label="Loading more receipts…" />
    ) : null;
  }

  return (
    <Stack direction="column" gap="xs">
      <Text variant="body-sm">
        {`Hydrating ${hydration.done} of ${hydration.total} receipts — cached after this, so the next load is instant.`}
      </Text>
      <Meter
        value={hydration.done}
        max={hydration.total}
        label="Receipts hydrated"
      />
    </Stack>
  );
}
