import { usePaginatedQuery } from 'convex/react';
import { Button, EmptyState, Stack, Text } from '@wordpress/ui';
import { store as storeIcon } from '@wordpress/icons';
import { STORE_LABELS } from '@matvis/shared';
import { ProductList, PRODUCT_LIST_PAGE } from '../../components/ProductList';
import { api } from '../../lib/convexApi';
import { navigate, searchPath, type CatalogStore } from '../../lib/route';
import { useSearchLog } from './useSearchLog';

function otherStore(store: CatalogStore): CatalogStore {
  return store === 'coop' ? 'ica' : 'coop';
}

export function StoreResults({
  store,
  term,
}: {
  store: CatalogStore;
  term: string;
}) {
  const page = usePaginatedQuery(
    api.portal.search,
    { q: term || undefined, store },
    { initialNumItems: PRODUCT_LIST_PAGE },
  );
  useSearchLog(term, page.status, page.results.length);

  const nothingFound =
    term !== '' &&
    page.status !== 'LoadingFirstPage' &&
    page.results.length === 0;

  if (nothingFound) {
    const next = otherStore(store);
    return (
      <EmptyState.Root>
        <EmptyState.Icon icon={storeIcon} />
        <EmptyState.Title>
          Nothing in {STORE_LABELS[store]} matches “{term}”
        </EmptyState.Title>
        <EmptyState.Description>
          Try {STORE_LABELS[next]}, or a different search.
        </EmptyState.Description>
        <EmptyState.Actions>
          <Button
            variant="solid"
            onClick={() => navigate(searchPath(next, term))}
          >
            Search {STORE_LABELS[next]} instead
          </Button>
        </EmptyState.Actions>
      </EmptyState.Root>
    );
  }

  return (
    <Stack direction="column" gap="sm">
      {term && <Text variant="body-sm">Best match first</Text>}
      <ProductList
        rows={page.results.map((row) => ({
          ...row,
          store: row.store as CatalogStore,
        }))}
        status={page.status}
        loadMore={page.loadMore}
      />
    </Stack>
  );
}
