import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Button, Card, Stack, Tabs, Text } from '@wordpress/ui';
import { ConnectPanel } from './features/ConnectPanel';
import { ReceiptsPanel } from './features/ReceiptsPanel';
import { DevPortal } from './features/DevPortal';

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

/** Sign-in gate: the connector is its own identity authority, so a GitHub login
 * establishes the connector account that scopes every store link and read. */
function SignIn() {
  const { signIn } = useAuthActions();
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
          <Button variant="solid" onClick={() => void signIn('github')}>
            Sign in with GitHub
          </Button>
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
