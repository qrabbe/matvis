import { Icon, Stack } from '@wordpress/ui';
import { search } from '@wordpress/icons';
import { ProductTile } from './ProductTile';
import type { Product } from '../lib/products';

export function ShelfPreview( {
	products,
	count = 8,
	cols = 4,
}: {
	products: Product[];
	count?: number;
	cols?: number;
} ) {
	return (
		<Stack direction="column" gap="md">
			<div className="searchbox">
				<Icon icon={ search } size={ 20 } />
			</div>
			<div
				className="shelf"
				style={ { gridTemplateColumns: `repeat(${ cols }, 1fr)` } }
			>
				{ products.slice( 0, count ).map( ( product, i ) => (
					<ProductTile key={ i } product={ product } hi={ i === 0 } />
				) ) }
			</div>
		</Stack>
	);
}
