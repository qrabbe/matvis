import { useQuery, usePaginatedQuery } from 'convex/react';
import { EmptyState, LinkButton, Stack } from '@wordpress/ui';
import { store as storeIcon } from '@wordpress/icons';
import { STORE_LABELS } from '@matvis/shared';
import { SkeletonList } from '@matvis/ui';
import { ProductList, PRODUCT_LIST_PAGE } from '../../components/ProductList';
import { api } from '../../lib/convexApi';
import {
  branchPath,
  categoryPath,
  href,
  storeFrontPath,
  type CatalogStore,
} from '../../lib/route';
import { CategoryHeader, type Ancestor } from './CategoryHeader';
import { CategoryRows } from './CategoryRows';

type CategoryLevelRow = {
  slug: string;
  name: string;
  count: number;
  hasChildren: boolean;
};

type PortalListRow = {
  ean: string;
  name: string;
  brand?: string;
  packageSizeText?: string;
  imageUrl?: string;
  store: string;
};

/** The chain and every ancestor category, in order, plus the immediate
 * parent on its own — exactly the pages a category screen's back button and
 * path line point at. `path` is `getCategory`'s display names for the node
 * itself, so the node's own name is dropped before this runs. */
export function ancestorsFor(
  store: CatalogStore,
  slugPath: string,
  path: string[],
): { ancestors: Ancestor[]; parent: Ancestor } {
  const segments = slugPath.split('/');
  const chain = { name: STORE_LABELS[store], path: storeFrontPath(store) };
  const categories = path.slice(0, -1).map((name, index) => ({
    name,
    path: categoryPath(store, segments.slice(0, index + 1).join('/')),
  }));
  const lastCategory = categories[categories.length - 1];
  return {
    ancestors: [chain, ...categories],
    parent: lastCategory ?? chain,
  };
}

export function BrowseScreen({
  store,
  slugPath,
  showAll,
}: {
  store: CatalogStore;
  slugPath: string;
  showAll: boolean;
}) {
  if (slugPath === '') return <FrontLevel store={store} />;
  return <CategoryScreen store={store} slugPath={slugPath} showAll={showAll} />;
}

function FrontLevel({ store }: { store: CatalogStore }) {
  const rows = useQuery(api.portal.categoryLevel, { store, parentSlug: '' });

  if (rows === undefined) {
    return <SkeletonList label={`Loading ${STORE_LABELS[store]}`} rows={8} />;
  }

  return (
    <CategoryRows
      rows={rows.map((row: CategoryLevelRow) => ({
        key: row.slug,
        name: row.name,
        count: row.count,
        path: categoryPath(store, row.slug),
      }))}
    />
  );
}

function CategoryScreen({
  store,
  slugPath,
  showAll,
}: {
  store: CatalogStore;
  slugPath: string;
  showAll: boolean;
}) {
  const node = useQuery(api.portal.category, { store, slugPath });
  const showsProducts = node ? showAll || !node.hasChildren : false;

  const childLevel = useQuery(
    api.portal.categoryLevel,
    node && !showsProducts ? { store, parentSlug: slugPath } : 'skip',
  );
  const products = usePaginatedQuery(
    api.portal.branchProducts,
    node && showsProducts ? { store, categoryKey: node.categoryKey } : 'skip',
    { initialNumItems: PRODUCT_LIST_PAGE },
  );

  if (node === undefined) {
    return <SkeletonList label="Loading category" rows={8} />;
  }

  if (node === null) {
    return (
      <EmptyState.Root>
        <EmptyState.Icon icon={storeIcon} />
        <EmptyState.Title>Unknown category</EmptyState.Title>
        <EmptyState.Description>
          This address doesn't match anything in {STORE_LABELS[store]}.
        </EmptyState.Description>
        <EmptyState.Actions>
          <LinkButton href={href(storeFrontPath(store))} variant="solid">
            Back to {STORE_LABELS[store]}
          </LinkButton>
        </EmptyState.Actions>
      </EmptyState.Root>
    );
  }

  const { ancestors, parent } = ancestorsFor(store, slugPath, node.path);

  return (
    <Stack direction="column" gap="md">
      <CategoryHeader
        title={node.name}
        backPath={showAll ? categoryPath(store, slugPath) : parent.path}
        backLabel={showAll ? node.name : parent.name}
        ancestors={ancestors}
        count={node.count}
      />
      {showsProducts ? (
        <ProductList
          rows={products.results.map((row: PortalListRow) => ({
            ...row,
            store: row.store as CatalogStore,
          }))}
          status={products.status}
          loadMore={products.loadMore}
        />
      ) : (
        <CategoryRows
          allRow={{
            name: `All ${node.count.toLocaleString()} products`,
            path: branchPath(store, slugPath),
          }}
          rows={(childLevel ?? []).map((row: CategoryLevelRow) => ({
            key: row.slug,
            name: row.name,
            count: row.count,
            path: categoryPath(store, row.slug),
          }))}
        />
      )}
    </Stack>
  );
}
