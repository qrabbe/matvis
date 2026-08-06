import { useState } from 'react';
import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Button, Card, Stack, Tabs, Text } from '@wordpress/ui';
import { ErrorNotice } from '@matvis/ui';
import { ConnectPanel } from './features/ConnectPanel';
import { ConnectionsPanel } from './features/ConnectionsPanel';
import { TokenPanel } from './features/TokenPanel';
import { DemoPanel } from './features/DemoPanel';
import { DevPortal } from './features/DevPortal';
import { clearConnectionId } from './lib/connectionStore';
import { errMsg } from '@matvis/shared';

export function App() {
  return (
    <Stack
      direction="column"
      gap="xl"
      style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px' }}
    >
      <Stack direction="row" gap="md" justify="space-between" align="start">
        <Stack direction="column" gap="xs">
          <Text variant="heading-xl">Matvis Connector</Text>
          <Text variant="body-md">
            Link a store, sync receipts, build on the API
          </Text>
        </Stack>
        <Authenticated>
          <SignOutButton />
        </Authenticated>
      </Stack>

      <AuthLoading>
        <Text variant="body-md">Loading…</Text>
      </AuthLoading>

      <Unauthenticated>
        <SignIn />
      </Unauthenticated>

      <Authenticated>
        <Tabs.Root defaultValue="connect">
          <Tabs.List>
            <Tabs.Tab value="connect">Connect</Tabs.Tab>
            <Tabs.Tab value="developers">Developers</Tabs.Tab>
            <Tabs.Tab value="demo">Try a token</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="connect">
            <Stack direction="column" gap="xl" style={{ paddingTop: 20 }}>
              <ConnectPanel />
              <ConnectionsPanel />
              <TokenPanel />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="developers">
            <Stack direction="column" gap="xl" style={{ paddingTop: 20 }}>
              <DevPortal />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="demo">
            <Stack direction="column" gap="xl" style={{ paddingTop: 20 }}>
              <DemoPanel />
            </Stack>
          </Tabs.Panel>
        </Tabs.Root>
      </Authenticated>
    </Stack>
  );
}

function SignIn() {
  const { signIn } = useAuthActions();
  const [pending, setPending] = useState<'anonymous' | 'github' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (provider: 'anonymous' | 'github') => {
    setPending(provider);
    setError(null);
    try {
      await signIn(provider);
    } catch (e) {
      setError(errMsg(e));
      setPending(null);
    }
  };

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title>Sign in</Card.Title>
      </Card.Header>
      <Card.Content>
        <Stack direction="column" gap="md">
          <Text variant="body-md">
            Sign in to link a store and view your receipts. Your login is the
            connector account everything is scoped to.
          </Text>
          {error && <ErrorNotice title="Couldn’t sign in">{error}</ErrorNotice>}
          <Button
            variant="solid"
            loading={pending === 'anonymous'}
            disabled={pending !== null}
            onClick={() => void start('anonymous')}
          >
            Continue as guest
          </Button>
          <Text variant="body-sm" style={{ textAlign: 'center' }}>
            or
          </Text>
          <Button
            variant="outline"
            tone="neutral"
            loading={pending === 'github'}
            disabled={pending !== null}
            onClick={() => void start('github')}
          >
            Sign in with GitHub
          </Button>
          <Text variant="body-sm">
            Guest accounts are temporary — linked stores and receipts may be
            cleared after a few days. Sign in with GitHub to keep them.
          </Text>
        </Stack>
      </Card.Content>
    </Card.Root>
  );
}

function SignOutButton() {
  const { signOut } = useAuthActions();
  const handleSignOut = async () => {
    clearConnectionId();
    await signOut();
  };
  return (
    <Button
      variant="minimal"
      tone="neutral"
      onClick={() => void handleSignOut()}
    >
      Sign out
    </Button>
  );
}
