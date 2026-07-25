import type { ReactNode } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { Button, Stack, Text } from '@wordpress/ui';
import { InlineSpinner } from '../../components/InlineSpinner';
import { adminApi } from '../../lib/adminApi';
import { clearAdminToken, useAdminToken } from '../../lib/adminSession';
import { href } from '../../lib/route';
import { EnqueuePanel } from './EnqueuePanel';
import { OverviewPanel } from './OverviewPanel';
import { QueuePanel } from './QueuePanel';
import { RunControls } from './RunControls';
import { RunLogPanel } from './RunLogPanel';
import { SignInPanel } from './SignInPanel';
import { useAdminTask, TaskResult } from './task';

/**
 * The ingest control panel, on `#/admin` and deliberately not in the tab bar.
 * The public portal is a product page and this is not part of it.
 *
 * The whole gate is server side. Every query below sends the stored token and
 * comes back null when it is not a live session, which is how this component
 * tells "signed out" from "loading" without an error boundary.
 */
export function AdminConsole() {
  const token = useAdminToken();
  if (!token) return <ConsoleFrame>{<SignInPanel />}</ConsoleFrame>;
  return <SignedIn token={token} />;
}

function SignedIn({ token }: { token: string }) {
  const overview = useQuery(adminApi.admin.overview, { token });
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
      <Stack direction="column" gap="xl">
        <OverviewPanel overview={overview} />
        <RunControls token={token} paused={overview.paused} />
        <QueuePanel token={token} />
        <EnqueuePanel token={token} />
        <RunLogPanel token={token} />
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
          <Text variant="body-sm">
            Sign out forgets the token in this browser. Sign out everywhere
            deletes every session on the deployment, which is the whole
            revocation story.
          </Text>
          <TaskResult state={state} busyLabel="Revoking…" />
        </Stack>
      </Stack>
    </ConsoleFrame>
  );
}

/** Heading and a way back to the public portal, around whatever state the
 * console is in. */
function ConsoleFrame({ children }: { children: ReactNode }) {
  return (
    <Stack direction="column" gap="lg">
      <Stack direction="column" gap="xs">
        <Text variant="heading-lg">Ingest console</Text>
        <Text variant="body-sm">
          Drives the Coop pipeline. Crons are off, so nothing runs here unless
          someone starts it.
        </Text>
      </Stack>
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
