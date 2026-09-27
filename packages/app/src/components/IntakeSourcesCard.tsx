import { useMemo, useState } from 'react';
import { Text } from '@wordpress/ui';
import { Panel } from './Panel';
import { SegmentedChip, SelectChip, type ChipOption } from './chips';
import { formatPercent } from '../lib/format';
import {
	intakeSources,
	summarizeSources,
	type EatenSpan,
	type SourceGrouping,
} from '../lib/intake';
import { TARGET_DEFINITIONS, type TargetKey } from '../lib/targets';
import type { DateRange } from '../lib/dateRange';

const SHOWN = 4;

const NUTRIENTS: readonly ChipOption< TargetKey >[] = (
	Object.keys( TARGET_DEFINITIONS ) as TargetKey[]
 ).map( ( key ) => ( { value: key, label: TARGET_DEFINITIONS[ key ].label } ) );

const GROUPINGS: readonly ChipOption< SourceGrouping >[] = [
	{ value: 'product', label: 'Products' },
	{ value: 'category', label: 'Categories' },
];

const OTHERS: Record< SourceGrouping, [ string, string ] > = {
	product: [ 'other product', 'other products' ],
	category: [ 'other category', 'other categories' ],
};

export function IntakeSourcesCard( {
	spans,
	range,
}: {
	spans: readonly EatenSpan[];
	range: DateRange;
} ) {
	const [ nutrient, setNutrient ] = useState< TargetKey >( 'protein' );
	const [ grouping, setGrouping ] = useState< SourceGrouping >( 'product' );
	const { label, macro } = TARGET_DEFINITIONS[ nutrient ];

	const summary = useMemo(
		() =>
			summarizeSources(
				intakeSources( spans, range, macro, grouping ),
				SHOWN
			),
		[ spans, range, macro, grouping ]
	);
	const { total, top, rest } = summary;

	return (
		<Panel
			title={ `${ label } came from` }
			aside={
				<div style={ { display: 'flex', gap: 6, flexWrap: 'wrap' } }>
					<SelectChip
						label="Nutrient"
						value={ nutrient }
						options={ NUTRIENTS }
						onChange={ setNutrient }
					/>
					<SegmentedChip
						label="Group by"
						value={ grouping }
						options={ GROUPINGS }
						onChange={ setGrouping }
					/>
				</div>
			}
		>
			{ top.length === 0 ? (
				<Text variant="body-sm" style={ { opacity: 0.7 } }>
					{ `No ${ label.toLowerCase() } counted in this range yet.` }
				</Text>
			) : (
				<div style={ { display: 'grid', gap: 5 } }>
					{ top.map( ( source ) => (
						<ShareRow
							key={ source.name }
							name={ source.name }
							share={ formatPercent( source.amount, total ) }
						/>
					) ) }
					{ rest.count > 0 && (
						<ShareRow
							muted
							name={ `${ rest.count } ${ OTHERS[ grouping ][ rest.count === 1 ? 0 : 1 ] }` }
							share={ formatPercent( rest.amount, total ) }
						/>
					) }
				</div>
			) }
		</Panel>
	);
}

function ShareRow( {
	name,
	share,
	muted = false,
}: {
	name: string;
	share: string;
	muted?: boolean;
} ) {
	return (
		<div
			style={ {
				display: 'flex',
				justifyContent: 'space-between',
				gap: 12,
				opacity: muted ? 0.7 : 1,
			} }
		>
			<Text
				variant="body-sm"
				style={ {
					minWidth: 0,
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
				} }
			>
				{ name }
			</Text>
			<Text
				variant="body-sm"
				style={ { opacity: 0.7, fontVariantNumeric: 'tabular-nums' } }
			>
				{ share }
			</Text>
		</div>
	);
}
