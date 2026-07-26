import { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import {
  Badge,
  Button,
  Card,
  InputControl,
  Link,
  Stack,
  Tabs,
  Text,
} from '@wordpress/ui';
// Fallback: `@wordpress/ui` has no progress primitive, and a hand-rolled bar
// would drift from the design system on the one screen a new user sees first.
import { ProgressBar } from '@wordpress/components';
import { STORE_LABELS } from '@matvis/shared';
import { ActivityPanel } from './features/ActivityPanel';
import { NutritionPanel } from './features/NutritionPanel';
import { PantryPanel } from './features/PantryPanel';
import { PreferencesPanel } from './features/PreferencesPanel';
import { PurchasesPanel } from './features/PurchasesPanel';
import { StatsPanel } from './features/StatsPanel';
import { UnmappedPanel } from './features/UnmappedPanel';
import { ErrorNotice } from './components/ErrorNotice';
import { InlineSpinner } from './components/InlineSpinner';
import { usePurchaseData, type PurchaseData } from './hooks/usePurchaseData';
import { api } from './lib/convexApi';
import { looksLikeToken, useApiToken } from './lib/tokenStore';

/**
 * The Matvis app: seven tabs over the two Convex deployments.
 *
 * Read-only by construction, not by convention. `main.tsx` mounts
 * `ConvexProvider` and never `ConvexAuthProvider`, so there is no session; every
 * connector write resolves its caller through `getAuthUserId` and throws
 * `Unauthenticated` before it reaches a handler. The catalog exposes no public
 * write at all. The app holds one credential — the account API read token — and
 * both typed facades declare nothing but queries.
 *
 * Tab order front-loads what works. Purchases, Activity and Stats derive from
 * receipt HEADERS and are complete today; Pantry and Nutrition depend on a
 * matching engine that does not exist yet and so start near-empty. Unmapped is
 * where that gap is measured, which makes it the most useful tab at launch.
 */
export function App() {
  const { token, setToken, forgetToken } = useApiToken();
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

          <Tabs.Root defaultValue="purchases">
            <Tabs.List>
              <Tabs.Tab value="pantry">Pantry</Tabs.Tab>
              <Tabs.Tab value="nutrition">Nutrition</Tabs.Tab>
              <Tabs.Tab value="activity">Activity</Tabs.Tab>
              <Tabs.Tab value="stats">Stats</Tabs.Tab>
              <Tabs.Tab value="purchases">Purchases</Tabs.Tab>
              <Tabs.Tab value="unmapped">Unmapped</Tabs.Tab>
              <Tabs.Tab value="preferences">Preferences</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="pantry" style={{ paddingTop: 20 }}>
              <PantryPanel data={data} />
            </Tabs.Panel>
            <Tabs.Panel value="nutrition" style={{ paddingTop: 20 }}>
              <NutritionPanel data={data} />
            </Tabs.Panel>
            <Tabs.Panel value="activity" style={{ paddingTop: 20 }}>
              <ActivityPanel data={data} />
            </Tabs.Panel>
            <Tabs.Panel value="stats" style={{ paddingTop: 20 }}>
              <StatsPanel data={data} />
            </Tabs.Panel>
            <Tabs.Panel value="purchases" style={{ paddingTop: 20 }}>
              <PurchasesPanel data={data} token={token} />
            </Tabs.Panel>
            <Tabs.Panel value="unmapped" style={{ paddingTop: 20 }}>
              <UnmappedPanel data={data} />
            </Tabs.Panel>
            <Tabs.Panel value="preferences" style={{ paddingTop: 20 }}>
              <PreferencesPanel onForgetToken={forgetToken} />
            </Tabs.Panel>
          </Tabs.Root>
        </>
      )}
    </Stack>
  );
}

/** Title plus the stores behind the token — the quickest confirmation that the
 * pasted credential resolves to the account the user expected. */
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

/**
 * Onboarding is a paste step, not a sign-in button — a direct consequence of the
 * app having no session. The token is minted in the connector portal, which is
 * also where a store gets linked, so the gate points there rather than trying to
 * do either job itself.
 */
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

/** First-load progress. Shown only while there is genuinely something to wait
 * for: a warm IndexedDB cache reports nothing to hydrate and this disappears. */
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
      <ProgressBar
        value={
          hydration.total > 0 ? (hydration.done / hydration.total) * 100 : 0
        }
      />
    </Stack>
  );
}
