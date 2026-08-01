import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
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
import { STORE_LABELS } from '@matvis/shared';
import { ErrorNotice, InlineSpinner } from '@matvis/ui';
import { Meter } from './components/Meter';
import { usePurchaseData, type PurchaseData } from './hooks/usePurchaseData';
import { api } from './lib/convexApi';
import { looksLikeToken, useApiToken } from './lib/tokenStore';

/**
 * Every panel is loaded on demand, which is the only reason the entry chunk is
 * not the whole app. `Tabs.Panel` defaults to `keepMounted = false`, so an
 * unopened tab never renders and never asks for its chunk: recharts stays
 * unfetched for anyone who does not open Nutrition, Stats or Activity, and
 * dataviews for anyone who does not open Purchases or Unmapped. The panels are
 * named exports, hence the mapping to `default`.
 */
const ActivityPanel = lazy(() =>
  import('./features/ActivityPanel').then((m) => ({
    default: m.ActivityPanel,
  })),
);
const NutritionPanel = lazy(() =>
  import('./features/NutritionPanel').then((m) => ({
    default: m.NutritionPanel,
  })),
);
const PantryPanel = lazy(() =>
  import('./features/PantryPanel').then((m) => ({ default: m.PantryPanel })),
);
const PreferencesPanel = lazy(() =>
  import('./features/PreferencesPanel').then((m) => ({
    default: m.PreferencesPanel,
  })),
);
const PurchasesPanel = lazy(() =>
  import('./features/PurchasesPanel').then((m) => ({
    default: m.PurchasesPanel,
  })),
);
const StatsPanel = lazy(() =>
  import('./features/StatsPanel').then((m) => ({ default: m.StatsPanel })),
);
const UnmappedPanel = lazy(() =>
  import('./features/UnmappedPanel').then((m) => ({
    default: m.UnmappedPanel,
  })),
);

/** Everything a panel can draw on. Each tab takes what it needs and ignores the
 * rest, which is what keeps the panels out of each other's prop lists. */
type TabContext = {
  data: PurchaseData;
  token: string;
  forgetToken: () => void;
};

/**
 * The seven tabs, in the order they are shown.
 *
 * The order is the point of this array and is literal on purpose: it front-loads
 * what works. Purchases, Activity and Stats derive from receipt HEADERS and are
 * complete today; Pantry and Nutrition depend on a matching engine that does not
 * exist yet and so start near-empty. Unmapped is where that gap is measured,
 * which makes it the most useful tab at launch.
 */
const TABS: {
  id: string;
  label: string;
  render: (context: TabContext) => ReactNode;
}[] = [
  {
    id: 'pantry',
    label: 'Pantry',
    render: ({ data }) => <PantryPanel data={data} />,
  },
  {
    id: 'nutrition',
    label: 'Nutrition',
    render: ({ data }) => <NutritionPanel data={data} />,
  },
  {
    id: 'activity',
    label: 'Activity',
    render: ({ data }) => <ActivityPanel data={data} />,
  },
  {
    id: 'stats',
    label: 'Stats',
    render: ({ data }) => <StatsPanel data={data} />,
  },
  {
    id: 'purchases',
    label: 'Purchases',
    render: ({ data, token }) => <PurchasesPanel data={data} token={token} />,
  },
  {
    id: 'unmapped',
    label: 'Unmapped',
    render: ({ data }) => <UnmappedPanel data={data} />,
  },
  {
    id: 'preferences',
    label: 'Preferences',
    render: ({ forgetToken }) => (
      <PreferencesPanel onForgetToken={forgetToken} />
    ),
  },
];

/**
 * The Matvis app: seven tabs over the two Convex deployments.
 *
 * Read-only by construction, not by convention. `main.tsx` mounts
 * `ConvexProvider` and never `ConvexAuthProvider`, so there is no session; every
 * connector write resolves its caller through `getAuthUserId` and throws
 * `Unauthenticated` before it reaches a handler. The catalog exposes no public
 * write at all. The app holds one credential — the account API read token — and
 * both typed facades declare nothing but queries.
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
              {TABS.map((tab) => (
                <Tabs.Tab key={tab.id} value={tab.id}>
                  {tab.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>

            {TABS.map((tab) => (
              <Tabs.Panel
                key={tab.id}
                value={tab.id}
                style={{ paddingTop: 20 }}
              >
                <Suspense fallback={<InlineSpinner label="Loading…" />}>
                  {tab.render({ data, token, forgetToken })}
                </Suspense>
              </Tabs.Panel>
            ))}
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
      <Meter
        value={hydration.done}
        max={hydration.total}
        label="Receipts hydrated"
      />
    </Stack>
  );
}
