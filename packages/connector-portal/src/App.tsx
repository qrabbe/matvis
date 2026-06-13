import { useState } from 'react';
import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Button, Card, Notice, Stack, Tabs, Text } from '@wordpress/ui';
import { ConnectPanel } from './features/ConnectPanel';
import { ReceiptsPanel } from './features/ReceiptsPanel';
import { DevPortal } from './features/DevPortal';
import { errMsg } from './lib/format';

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
          </Tabs.List>

          <Tabs.Panel value="connect">
            <Stack direction="column" gap="xl" style={{ paddingTop: 20 }}>
              <ConnectPanel />
              <ReceiptsPanel />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="developers">
            <Stack direction="column" gap="xl" style={{ paddingTop: 20 }}>
              <DevPortal />
            </Stack>
          </Tabs.Panel>
        </Tabs.Root>
      </Authenticated>
    </Stack>
  );
}

/** Sign-in gate: the connector is its own identity authority, so a login
 * establishes the connector account that scopes every store link and read.
 * Either provider (a guest login or GitHub OAuth) lands on the same connector
 * account, keyed off the authenticated identity. */
function SignIn() {
  const { signIn } = useAuthActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guest = async () => {
    setPending(true);
    setError(null);
    try {
      await signIn('anonymous');
    } catch (e) {
      setError(errMsg(e));
      setPending(false);
    }
    // On success the component unmounts (auth flips to <Authenticated>), so
    // there's no state to reset.
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
          {error && (
            <Notice.Root intent="error">
              <Notice.Title>Couldn’t sign in</Notice.Title>
              <Notice.Description>{error}</Notice.Description>
            </Notice.Root>
          )}
          <Button
            variant="solid"
            loading={pending}
            onClick={() => void guest()}
          >
            Continue as guest
          </Button>
          <Text variant="body-sm" style={{ textAlign: 'center' }}>
            or
          </Text>
          <Button
            variant="outline"
            tone="neutral"
            onClick={() => void signIn('github')}
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
  return (
    <Button variant="minimal" tone="neutral" onClick={() => void signOut()}>
      Sign out
    </Button>
  );
}
