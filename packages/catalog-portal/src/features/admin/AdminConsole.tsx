import { useState, type ComponentProps, type ReactNode } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { Button, SelectControl, Stack, Tabs, Text } from '@wordpress/ui';
import { InlineSpinner } from '@matvis/ui';
import { STORE_LABELS } from '@matvis/shared';
import { INGEST_LANES, type IngestLane } from '@matvis/catalog';
import { adminApi } from '../../lib/adminApi';
import { clearAdminToken, useAdminToken } from '../../lib/adminSession';
import { href } from '../../lib/route';
import { CoveragePanel } from './CoveragePanel';
import { EnqueuePanel } from './EnqueuePanel';
import { OverviewPanel } from './OverviewPanel';
import { QueuePanel } from './QueuePanel';
import { RunControls } from './RunControls';
import { RunLogPanel } from './RunLogPanel';
import { RunTrendPanel } from './RunTrendPanel';
import { SearchPanel } from './SearchPanel';
import { SignInPanel } from './SignInPanel';
import { useAdminTask, TaskResult } from './task';

export function AdminConsole() {
  const token = useAdminToken();
  if (!token) return <ConsoleFrame>{<SignInPanel />}</ConsoleFrame>;
  return <SignedIn token={token} />;
}

function SignedIn({ token }: { token: string }) {
  // The lane every panel below works in. It lives above the `overview` query
  // because fill progress is per store, so the selection has to reach the query
  // and not only the panel that renders it.
  const [store, setStore] = useState<IngestLane>('coop');
  const overview = useQuery(adminApi.admin.overview, { token, store });
  const signOutEverywhere = useMutation(adminApi.admin.signOutEverywhere);
  const { state, run } = useAdminTask();

  if (overview === undefined) {
    return (
      <ConsoleFrame>
        <InlineSpinner label="Loading console…" variant="body-md" />
      </ConsoleFrame>
    );
  }
  if (overview === null) {
    return (
      <ConsoleFrame>
        <SignInPanel expired />
      </ConsoleFrame>
    );
  }

  return (
    <ConsoleFrame>
      <Stack direction="column" gap="lg">
        <Tabs.Root defaultValue="overview">
          <Tabs.List>
            <Tabs.Tab value="overview">Overview</Tabs.Tab>
            <Tabs.Tab value="ingest">Ingest</Tabs.Tab>
            <Tabs.Tab value="search">Search</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="overview">
            <Stack
              direction="column"
              gap="xl"
              style={{ paddingTop: 'var(--wpds-dimension-padding-lg)' }}
            >
              <OverviewPanel overview={overview} token={token} store={store} />
              <CoveragePanel token={token} />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="ingest">
            <Stack
              direction="column"
              gap="xl"
              style={{ paddingTop: 'var(--wpds-dimension-padding-lg)' }}
            >
              <LanePicker store={store} onSelect={setStore} />
              <RunControls
                token={token}
                store={store}
                paused={overview.paused}
              />
              <QueuePanel token={token} store={store} />
              <EnqueuePanel token={token} store={store} />
              <RunTrendPanel token={token} />
              <RunLogPanel token={token} />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="search">
            <Stack
              direction="column"
              gap="xl"
              style={{ paddingTop: 'var(--wpds-dimension-padding-lg)' }}
            >
              <SearchPanel token={token} />
            </Stack>
          </Tabs.Panel>
        </Tabs.Root>
        <Stack direction="column" gap="sm">
          <Stack direction="row" gap="md" align="center" wrap="wrap">
            <Button
              variant="outline"
              tone="neutral"
              onClick={() => clearAdminToken()}
            >
              Sign out
            </Button>
            <Button
              variant="outline"
              tone="neutral"
              onClick={() =>
                run(async () => {
                  const result = await signOutEverywhere({ token });
                  clearAdminToken();
                  return `Revoked ${result.revoked} session(s).`;
                })
              }
            >
              Sign out everywhere
            </Button>
          </Stack>
          <TaskResult state={state} busyLabel="Revoking…" />
        </Stack>
      </Stack>
    </ConsoleFrame>
  );
}

type SelectItem = NonNullable<
  ComponentProps<typeof SelectControl>['items']
>[number];

/** Only the stores with a fetch lane, read from `INGEST_LANES` rather than
 * `STORES`. Ten chains can appear on a receipt and two can be ingested. */
const LANE_ITEMS: SelectItem[] = INGEST_LANES.map((store) => ({
  label: STORE_LABELS[store],
  value: store,
}));

function LanePicker({
  store,
  onSelect,
}: {
  store: IngestLane;
  onSelect: (store: IngestLane) => void;
}) {
  const selection =
    LANE_ITEMS.find((item) => item.value === store) ?? LANE_ITEMS[0]!;

  return (
    <Stack direction="column" gap="sm">
      <div style={{ flex: '0 1 180px', maxWidth: 180 }}>
        <SelectControl
          label="Lane"
          items={LANE_ITEMS}
          value={selection}
          onValueChange={(item) =>
            onSelect((item?.value as IngestLane) ?? 'coop')
          }
        />
      </div>
    </Stack>
  );
}

function ConsoleFrame({ children }: { children: ReactNode }) {
  return (
    <Stack direction="column" gap="lg">
      <Text variant="heading-lg">Catalog console</Text>
      {children}
      <Text
        variant="body-sm"
        render={<a href={href('/')} style={{ color: 'inherit' }} />}
      >
        ← Back to the catalog
      </Text>
    </Stack>
  );
}
