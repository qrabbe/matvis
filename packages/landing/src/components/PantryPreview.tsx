import { Icon } from '@wordpress/ui';
import { chartBar, cog, grid, receipt } from '@wordpress/icons';
import { ProductTile } from './ProductTile';
import type { Product } from '../lib/products';

const PANTRY = [ 0, 1, 4, 3, 5, 6 ];
const COUNTS = [ '×3', '×2', '', '×1', '×4', '' ];
const DAY_DOTS = [
	'color-foreground-content-success',
	'color-foreground-content-warning',
	'color-foreground-content-error',
	'color-foreground-content-warning',
	'color-foreground-content-success',
];
const TABS = [ grid, chartBar, receipt, cog ];

export function PantryPreview( {
	products,
	size = 'md',
}: {
	products: Product[];
	size?: 'md' | 'lg';
} ) {
	return (
		<div className={ `handset ${ size }` }>
			<div className="days">
				{ DAY_DOTS.map( ( dot, i ) => (
					<span key={ i } className={ i === 3 ? 'day sel' : 'day' }>
						<i style={ { background: `var(--wpds-${ dot })` } } />
					</span>
				) ) }
			</div>
			<div className="pantry">
				{ PANTRY.map( ( p, i ) => (
					<ProductTile
						key={ i }
						product={ products[ p ]! }
						hi={ i === 0 }
						small
						count={ COUNTS[ i ] }
					/>
				) ) }
			</div>
			<div className="tabbar">
				{ TABS.map( ( ic, i ) => (
					<Icon
						key={ i }
						icon={ ic }
						size={ 16 }
						className={ i === 0 ? 'on' : undefined }
					/>
				) ) }
			</div>
		</div>
	);
}
