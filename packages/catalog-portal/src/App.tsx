import { useQuery } from 'convex/react';
import { Stack, Tabs, Text } from '@wordpress/ui';
import { CatalogPanel } from './features/CatalogPanel';
import { DevPortal } from './features/DevPortal';
import { api } from './lib/convexApi';

// No sign-in gate — the catalog is a public, read-only database. Header shows
// the live product total; two tabs: the search table and the docs.
export function App() {
  const stats = useQuery(api.catalog.stats, {});
  return (
    <Stack
      direction="column"
      gap="xl"
      style={{ maxWidth: 860, margin: '0 auto', padding: '48px 20px' }}
    >
      <Stack direction="column" gap="xs">
        <Text variant="heading-xl">Matvis Catalog</Text>
        <Text variant="body-md">
          {stats ? `${stats.total} products` : 'Product database'}
        </Text>
      </Stack>
      <Tabs.Root defaultValue="catalog">
        <Tabs.List>
          <Tabs.Tab value="catalog">Catalog</Tabs.Tab>
          <Tabs.Tab value="developers">Developers</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="catalog">
          <Stack direction="column" gap="xl" style={{ paddingTop: 20 }}>
            <CatalogPanel />
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
