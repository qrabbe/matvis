import { globe, grid, key, lock, receipt, store } from '@wordpress/icons';
import { Door } from '../components/Door';
import { ChainLogos } from '../components/ChainLogos';
import { ReceiptPreview } from '../components/ReceiptPreview';
import { ShelfPreview } from '../components/ShelfPreview';
import { PantryPreview } from '../components/PantryPreview';
import { ALL_CHAINS, CONNECTED_CHAINS } from '../lib/chains';
import { PLACEHOLDER_PRODUCTS } from '../lib/products';

const ACCESS = {
	catalog: { label: 'Open to everyone', hint: 'open to everyone' },
	connector: { label: 'BankID sign-in', hint: 'BankID sign-in' },
	app: {
		label: 'Token from the connector',
		hint: 'needs a token from the connector',
	},
};

function Arrow( { dir, area }: { dir: 'right' | 'down'; area?: string } ) {
	return (
		<span className={ `arrow ${ dir }` } style={ { gridArea: area } }>
			<i />
		</span>
	);
}

/**
 * The desktop and phone layouts render at the same time; a CSS media query
 * at 1040px decides which one is visible, so there's no layout flash and no
 * JS resize listener.
 */
export function Flow() {
	return (
		<>
			<div className="desk">
				<div className="src" style={ { gridArea: 's1' } }>
					<ChainLogos chains={ ALL_CHAINS } cols={ 2 } />
				</div>
				<Arrow dir="right" area="a1" />
				<div style={ { gridArea: 'cat' } }>
					<Door
						href="catalog/"
						name="Catalog"
						glyph={ store }
						access={ globe }
						accessLabel={ ACCESS.catalog.label }
						accessHint={ ACCESS.catalog.hint }
						primary
					>
						<ShelfPreview
							products={ PLACEHOLDER_PRODUCTS }
							count={ 4 }
						/>
					</Door>
				</div>

				<div className="src single" style={ { gridArea: 's2' } }>
					<ChainLogos chains={ CONNECTED_CHAINS } cols={ 1 } />
				</div>
				<Arrow dir="right" area="a2" />
				<div style={ { gridArea: 'con' } }>
					<Door
						href="connector/"
						name="Connector"
						glyph={ receipt }
						access={ lock }
						accessLabel={ ACCESS.connector.label }
						accessHint={ ACCESS.connector.hint }
					>
						<ReceiptPreview />
					</Door>
				</div>

				<span className="join" style={ { gridArea: 'join' } }>
					<i />
				</span>
				<div className="app-cell" style={ { gridArea: 'app' } }>
					<Door
						href="app/"
						name="Matvis app"
						glyph={ grid }
						access={ key }
						accessLabel={ ACCESS.app.label }
						accessHint={ ACCESS.app.hint }
					>
						<PantryPreview
							products={ PLACEHOLDER_PRODUCTS }
							size="lg"
						/>
					</Door>
				</div>
			</div>

			<div className="phone">
				<div className="src">
					<ChainLogos chains={ ALL_CHAINS } cols={ 3 } />
				</div>
				<div className="src">
					<ChainLogos chains={ CONNECTED_CHAINS } cols={ 1 } />
				</div>
				<Arrow dir="down" />
				<Arrow dir="down" />
				<Door
					href="catalog/"
					name="Catalog"
					glyph={ store }
					access={ globe }
					accessLabel={ ACCESS.catalog.label }
					accessHint={ ACCESS.catalog.hint }
					primary
					compact
				>
					<ShelfPreview
						products={ PLACEHOLDER_PRODUCTS }
						count={ 4 }
						cols={ 2 }
					/>
				</Door>
				<Door
					href="connector/"
					name="Connector"
					glyph={ receipt }
					access={ lock }
					accessLabel={ ACCESS.connector.label }
					accessHint={ ACCESS.connector.hint }
					compact
				>
					<ReceiptPreview compact />
				</Door>
				<span className="join-down" />
				<div style={ { gridColumn: '1 / -1' } }>
					<Door
						href="app/"
						name="Matvis app"
						glyph={ grid }
						access={ key }
						accessLabel={ ACCESS.app.label }
						accessHint={ ACCESS.app.hint }
					>
						<PantryPreview products={ PLACEHOLDER_PRODUCTS } />
					</Door>
				</div>
			</div>
		</>
	);
}
