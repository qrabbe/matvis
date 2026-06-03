import { Stack, Tabs, Text } from '@wordpress/ui';
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
      <Stack direction="column" gap="xs">
        <Text variant="heading-xl">Matvis Connector</Text>
        <Text variant="body-md">
          Link a store, sync receipts, build on the API
        </Text>
      </Stack>

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
    </Stack>
  );
}
