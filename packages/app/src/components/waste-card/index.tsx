import { Text } from '@wordpress/ui';
import { Panel } from '../panel';
import type { WasteSummary } from '../../lib/intake';

export function WasteCard( {
	summary,
	month,
}: {
	summary: WasteSummary;
	month: string;
} ) {
	return (
		<Panel
			title="Thrown away"
			aside={
				<Text variant="body-sm" style={ { opacity: 0.6 } }>
					{ month }
				</Text>
			}
		>
			{ summary.count === 0 ? (
				<Text variant="body-sm" style={ { opacity: 0.7 } }>
					{ `Nothing thrown away in ${ month }.` }
				</Text>
			) : (
				<>
					<div
						style={ {
							display: 'flex',
							gap: 18,
							alignItems: 'baseline',
						} }
					>
						<Figure
							value={ Math.round( summary.kr ).toLocaleString(
								'sv-SE'
							) }
							unit="kr"
						/>
						<Figure
							value={ String( summary.count ) }
							unit={ summary.count === 1 ? 'item' : 'items' }
						/>
					</div>
					<Text variant="body-sm" style={ { opacity: 0.7 } }>
						{ summary.products
							.map( ( p ) =>
								p.count > 1
									? `${ p.name } ×${ p.count }`
									: p.name
							)
							.join( ', ' ) }
					</Text>
				</>
			) }
		</Panel>
	);
}

function Figure( { value, unit }: { value: string; unit: string } ) {
	return (
		<span
			style={ { display: 'inline-flex', alignItems: 'baseline', gap: 4 } }
		>
			<Text
				variant="heading-lg"
				style={ { fontVariantNumeric: 'tabular-nums' } }
			>
				{ value }
			</Text>
			<Text variant="body-sm" style={ { opacity: 0.7 } }>
				{ unit }
			</Text>
		</span>
	);
}
