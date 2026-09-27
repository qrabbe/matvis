import { useEffect, useRef, useState } from 'react';
import { Stack, Tabs } from '@wordpress/ui';
import {
  catalogRoute,
  navigate,
  searchPath,
  storeFrontPath,
  type CatalogStore,
} from '../lib/route';
import { BrowseScreen } from './browse/BrowseScreen';
import { SearchField } from './search/SearchField';
import { StoreResults } from './search/StoreResults';
import { useSettledTerm } from './search/useSettledTerm';

const SEARCH_DELAY_MS = 1000;

export function CatalogTab({ path }: { path: string }) {
  const route = catalogRoute(path);
  const routeTerm = route.kind === 'search' ? route.term : '';

  const [typedTerm, setTypedTerm] = useState(routeTerm);
  const { searchedTerm, waiting, searchNow } = useSettledTerm(
    typedTerm,
    SEARCH_DELAY_MS,
  );
  // What this component itself last pushed onto the route, so an external
  // change (a deep link, or the back button) can be told apart from one of
  // its own navigations.
  const pushed = useRef(routeTerm);

  useEffect(() => {
    if (routeTerm === pushed.current) return;
    pushed.current = routeTerm;
    setTypedTerm(routeTerm);
  }, [routeTerm]);

  useEffect(() => {
    if (searchedTerm === pushed.current) return;
    pushed.current = searchedTerm;
    navigate(
      searchedTerm === ''
        ? storeFrontPath(route.store)
        : searchPath(route.store, searchedTerm),
    );
  }, [searchedTerm, route.store]);

  function pickStore(next: CatalogStore) {
    if (next === route.store) return;
    if (searchedTerm) {
      pushed.current = searchedTerm;
      navigate(searchPath(next, searchedTerm));
    } else {
      navigate(storeFrontPath(next));
    }
  }

  return (
    <Stack direction="column" gap="md">
      <Tabs.Root
        value={route.store}
        onValueChange={(value) => pickStore(value as CatalogStore)}
      >
        <Tabs.List variant="minimal">
          <Tabs.Tab value="coop">Coop</Tabs.Tab>
          <Tabs.Tab value="ica">ICA</Tabs.Tab>
        </Tabs.List>
      </Tabs.Root>
      <SearchField
        store={route.store}
        value={typedTerm}
        waiting={waiting}
        onChange={setTypedTerm}
        onEnter={() => searchNow()}
        onClear={() => {
          setTypedTerm('');
          searchNow('');
        }}
      />
      {route.kind === 'search' ? (
        <StoreResults store={route.store} term={searchedTerm} />
      ) : (
        <BrowseScreen
          store={route.store}
          slugPath={route.kind === 'front' ? '' : route.slugPath}
          showAll={route.kind === 'branch'}
        />
      )}
    </Stack>
  );
}
