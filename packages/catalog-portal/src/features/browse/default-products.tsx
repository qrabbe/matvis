import { useQuery } from 'convex/react';
import { Stack, Text } from '@wordpress/ui';
import { STORE_LABELS } from '@matvis/shared';
import { SkeletonList } from '@matvis/ui';
import { ProductList } from '../../components/product-list';
import { api } from '../../lib/convex-api';
import type { CatalogStore } from '../../lib/route';

const DEFAULT_PRODUCTS_COUNT = 12;

/**
 * A bounded taste of the chain's most recently added products, in the same
 * `ProductList` table as a category's own product screens. Not paginated:
 * `status="Exhausted"` keeps its infinite scroll from asking for more, a
 * chain's category rows are what browses the rest.
 */
export function DefaultProducts( { store }: { store: CatalogStore } ) {
	const page = useQuery( api.portal.search, {
		store,
		paginationOpts: { numItems: DEFAULT_PRODUCTS_COUNT, cursor: null },
	} );

	if ( page === undefined ) {
		return (
			<SkeletonList
				label={ `Loading ${ STORE_LABELS[ store ] }` }
				rows={ 4 }
			/>
		);
	}

	return (
		<Stack direction="column" gap="sm">
			<Text variant="heading-md">New in { STORE_LABELS[ store ] }</Text>
			<ProductList
				rows={ page.page.map( ( row ) => ( { ...row, store } ) ) }
				status="Exhausted"
				loadMore={ () => {} }
			/>
		</Stack>
	);
}
