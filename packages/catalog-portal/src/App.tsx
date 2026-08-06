import { useQuery } from 'convex/react';
import { LinkButton, Stack, Tabs, Text } from '@wordpress/ui';
import { AdminConsole } from './features/admin/AdminConsole';
import { CatalogPanel } from './features/CatalogPanel';
import { DevPortal } from './features/DevPortal';
import { ProductDetail } from './features/ProductDetail';
import {
  ADMIN_PATH,
  eanFromPath,
  href,
  isAdminPath,
  useRoute,
} from './lib/route';
import { api } from './lib/convexApi';

export function App() {
  const stats = useQuery(api.catalog.stats, {});
  const route = useRoute();
  const ean = eanFromPath(route);
  const admin = isAdminPath(route);
  return (
    <Stack
      direction="column"
      gap="xl"
      style={{ maxWidth: 860, margin: '0 auto', padding: '48px 20px' }}
    >
      <Stack direction="row" gap="md" align="start" justify="space-between">
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
        {!admin && (
          <LinkButton
            href={href(ADMIN_PATH)}
            variant="outline"
            tone="neutral"
            size="compact"
          >
            Admin page
          </LinkButton>
        )}
      </Stack>
      {admin ? (
        <AdminConsole />
      ) : ean ? (
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
