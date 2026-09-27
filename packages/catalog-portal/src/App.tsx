import { useQuery } from 'convex/react';
import { LinkButton, Stack, Tabs, Text } from '@wordpress/ui';
import { STORE_LABELS, type StoreSlug } from '@matvis/shared';
import { AdminConsole } from './features/admin';
import { CatalogTab } from './features/catalog-tab';
import { DevPortal } from './features/dev-portal';
import { ProductDetail } from './features/product-detail';
import {
	ADMIN_PATH,
	DEVELOPERS_PATH,
	eanFromPath,
	href,
	isAdminPath,
	isDevelopersPath,
	navigate,
	storeFromPath,
	useRoute,
	type CatalogStore,
} from './lib/route';
import { api } from './lib/convex-api';

type Totals = { total: number; stores: { store: StoreSlug; count: number }[] };

/**
 * The header has room for one line, so the empty chains are dropped here even
 * though the query reports them. The console is where the zeros are worth
 * seeing.
 */
function summarise( { total, stores }: Totals ): string {
	const stocked = stores
		.filter( ( row ) => row.count > 0 )
		.sort( ( a, b ) => b.count - a.count )
		.map(
			( row ) =>
				`${ STORE_LABELS[ row.store ] } ${ row.count.toLocaleString() }`
		);
	const products = `${ total.toLocaleString() } products`;
	return stocked.length > 0
		? `${ products } · ${ stocked.join( ' · ' ) }`
		: products;
}

function Screen( {
	route,
	admin,
	ean,
	store,
	activeTab,
}: {
	route: string;
	admin: boolean;
	ean: string | null;
	store: CatalogStore | null;
	activeTab: 'catalog' | 'developers';
} ) {
	if ( admin ) {
		return <AdminConsole />;
	}
	if ( ean ) {
		return <ProductDetail ean={ ean } store={ store ?? undefined } />;
	}
	return (
		<Tabs.Root
			value={ activeTab }
			onValueChange={ ( value ) =>
				navigate( value === 'developers' ? DEVELOPERS_PATH : '/' )
			}
		>
			<Tabs.List>
				<Tabs.Tab value="catalog">Catalog</Tabs.Tab>
				<Tabs.Tab value="developers">Developers</Tabs.Tab>
			</Tabs.List>
			<Tabs.Panel value="catalog">
				<Stack direction="column" gap="md" style={ { paddingTop: 20 } }>
					<CatalogTab path={ route } />
				</Stack>
			</Tabs.Panel>
			<Tabs.Panel value="developers">
				<Stack direction="column" gap="xl" style={ { paddingTop: 20 } }>
					<DevPortal />
				</Stack>
			</Tabs.Panel>
		</Tabs.Root>
	);
}

export function App() {
	const health = useQuery( api.catalog.health, {} );
	const route = useRoute();
	const ean = eanFromPath( route );
	const store = storeFromPath( route );
	const admin = isAdminPath( route );
	const activeTab = isDevelopersPath( route ) ? 'developers' : 'catalog';
	return (
		<Stack
			direction="column"
			gap="xl"
			style={ {
				width: '100%',
				maxWidth: 720,
				margin: '0 auto',
				padding: '32px 16px',
				boxSizing: 'border-box',
			} }
		>
			<Stack
				direction="row"
				gap="md"
				wrap="wrap"
				align="start"
				justify="space-between"
			>
				<Stack direction="column" gap="xs">
					<Text
						variant="heading-xl"
						render={
							// Text clones its own children onto this anchor, so the
							// anchor is deliberately empty here.
							// eslint-disable-next-line jsx-a11y/anchor-has-content
							<a
								href={ href( '/' ) }
								style={ { color: 'inherit' } }
							/>
						}
					>
						Matvis Catalog
					</Text>
					<Text variant="body-md">
						{ health ? summarise( health ) : 'Product database' }
					</Text>
				</Stack>
				{ ! admin && (
					<LinkButton
						href={ href( ADMIN_PATH ) }
						variant="outline"
						tone="neutral"
						size="compact"
					>
						Admin page
					</LinkButton>
				) }
			</Stack>
			<Screen
				route={ route }
				admin={ admin }
				ean={ ean }
				store={ store }
				activeTab={ activeTab }
			/>
		</Stack>
	);
}
