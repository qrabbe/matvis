import { useEffect, useMemo, useState } from 'react';
import {
	DataViews,
	filterSortAndPaginate,
	type Field,
	type View,
} from '@wordpress/dataviews';
import { Text } from '@wordpress/ui';
import { sizedImageUrl } from '@matvis/ui';
import {
	href,
	navigate,
	productPath,
	type CatalogStore,
} from '../../lib/route';

export type ProductListRow = {
	ean: string;
	name: string;
	brand?: string;
	packageSizeText?: string;
	imageUrl?: string;
	store: CatalogStore;
};

export type PaginatedStatus =
	'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';

export const PRODUCT_LIST_PAGE = 48;

const IMAGE_PX = 200;

function brandAndSize( item: ProductListRow ): string {
	return [ item.brand, item.packageSizeText ].filter( Boolean ).join( ' · ' );
}

const FIELDS: Field< ProductListRow >[] = [
	{
		id: 'photo',
		label: 'Photo',
		type: 'media',
		enableSorting: false,
		enableHiding: false,
		getValue: ( { item } ) => item.imageUrl ?? '',
		render: ( { item } ) => {
			const src = sizedImageUrl( item.imageUrl, IMAGE_PX );
			return src ? <img src={ src } alt="" loading="lazy" /> : null;
		},
	},
	{
		id: 'name',
		label: 'Name',
		enableSorting: false,
		enableHiding: false,
		getValue: ( { item } ) => item.name,
		render: ( { item } ) => <Text variant="body-md">{ item.name }</Text>,
	},
	{
		id: 'description',
		label: 'Brand and size',
		enableSorting: false,
		enableHiding: false,
		getValue: ( { item } ) => brandAndSize( item ),
		render: ( { item } ) => (
			<Text variant="body-sm">{ brandAndSize( item ) }</Text>
		),
	},
];

const BASE_VIEW: View = {
	type: 'list',
	perPage: PRODUCT_LIST_PAGE,
	startPosition: 1,
	titleField: 'name',
	mediaField: 'photo',
	descriptionField: 'description',
	fields: [],
	infiniteScrollEnabled: true,
};

/**
 * Whether the window `view` is asking for reaches past what has loaded so
 * far. Pure, so the infinite-scroll wiring is testable without DataViews.
 */
export function needsMore(
	view: Pick< View, 'startPosition' | 'perPage' >,
	loadedCount: number,
	status: PaginatedStatus
): boolean {
	if ( status !== 'CanLoadMore' ) {
		return false;
	}
	const needed =
		( view.startPosition ?? 1 ) - 1 + ( view.perPage ?? PRODUCT_LIST_PAGE );
	return needed > loadedCount;
}

export function ProductList( {
	rows,
	status,
	loadMore,
}: {
	rows: ProductListRow[];
	status: PaginatedStatus;
	loadMore: ( numItems: number ) => void;
} ) {
	const [ view, setView ] = useState< View >( BASE_VIEW );

	useEffect( () => {
		if ( needsMore( view, rows.length, status ) ) {
			loadMore( PRODUCT_LIST_PAGE );
		}
	}, [ view, rows.length, status, loadMore ] );

	const { data, paginationInfo } = useMemo( () => {
		const filtered = filterSortAndPaginate( rows, view, FIELDS );
		// Search has no total, so infinite scroll is told there is one more page
		// until the query is actually exhausted.
		const totalItems =
			status === 'Exhausted'
				? rows.length
				: rows.length + PRODUCT_LIST_PAGE;
		return {
			data: filtered.data,
			paginationInfo: { ...filtered.paginationInfo, totalItems },
		};
	}, [ rows, view, status ] );

	return (
		<DataViews
			data={ data }
			fields={ FIELDS }
			view={ view }
			onChangeView={ setView }
			paginationInfo={ paginationInfo }
			getItemId={ ( item ) => item.ean }
			isLoading={ status === 'LoadingFirstPage' }
			defaultLayouts={ { list: {}, grid: {} } }
			search={ false }
			renderItemLink={ ( { item, children, ...props } ) => (
				<a
					{ ...props }
					href={ href( productPath( item.ean, item.store ) ) }
				>
					{ children }
				</a>
			) }
			// The list layout (the default here) ignores renderItemLink, it only
			// ever calls onChangeSelection. Grid honours renderItemLink on its own.
			onChangeSelection={ ( ids ) => {
				const row = data.find( ( item ) => item.ean === ids[ 0 ] );
				if ( row ) {
					navigate( productPath( row.ean, row.store ) );
				}
			} }
		/>
	);
}
