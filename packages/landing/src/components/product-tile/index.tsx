import { Silhouette } from '../silhouette';
import type { Product } from '../../lib/products';

export function ProductTile( {
	product,
	hi,
	small,
	count,
}: {
	product: Product;
	hi?: boolean;
	/** Pantry tiles use a smaller corner radius than shelf tiles. */
	small?: boolean;
	count?: string;
} ) {
	return (
		<span
			className={ [ 'tile', hi && 'hi' ].filter( Boolean ).join( ' ' ) }
			style={ {
				borderRadius: small
					? 'var(--wpds-border-radius-sm)'
					: 'var(--wpds-border-radius-md)',
			} }
		>
			<Silhouette { ...product } />
			{ count && <span className="count">{ count }</span> }
		</span>
	);
}
