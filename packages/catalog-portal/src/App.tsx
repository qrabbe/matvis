import { useQuery } from 'convex/react';
import { Stack, Tabs, Text } from '@wordpress/ui';
import { CatalogPanel } from './features/CatalogPanel';
import { DevPortal } from './features/DevPortal';
import { ProductDetail } from './features/ProductDetail';
import { eanFromPath, href, useRoute } from './lib/route';
import { api } from './lib/convexApi';

// No sign-in gate — the catalog is a public, read-only database. Header shows
// the live product total; the body is either the two tabs (search table + docs)
// or, on a `#/p/<ean>` route, one product's detail page.
export function App() {
  const stats = useQuery(api.catalog.stats, {});
  const route = useRoute();
  const ean = eanFromPath(route);
  return (
    <Stack
      direction="column"
      gap="xl"
      style={{ maxWidth: 860, margin: '0 auto', padding: '48px 20px' }}
    >
      <Stack direction="column" gap="xs">
        <Text
          variant="heading-xl"
          render={<a href={href('/')} style={{ color: 'inherit' }} />}
        >
          Matvis Catalog
        </Text>
        <Text variant="body-md">
          {stats ? `${stats.total} products` : 'Product database'}
        </Text>
      </Stack>
      {ean ? (
        <ProductDetail ean={ean} />
      ) : (
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
      )}
    </Stack>
  );
}
