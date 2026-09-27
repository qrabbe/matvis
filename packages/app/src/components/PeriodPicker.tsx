import { Text } from '@wordpress/ui';
import { SegmentedChip, type ChipOption } from './chips';
import {
	currentPeriod,
	isLatestPeriod,
	periodLabel,
	shiftPeriod,
	PERIOD_UNIT_LABELS,
	type Period,
	type PeriodUnit,
} from '../lib/period';

const UNITS: readonly ChipOption< PeriodUnit >[] = (
	Object.keys( PERIOD_UNIT_LABELS ) as PeriodUnit[]
 ).map( ( unit ) => ( { value: unit, label: PERIOD_UNIT_LABELS[ unit ] } ) );

export function PeriodPicker( {
	period,
	today,
	onChange,
}: {
	period: Period;
	today: Date;
	onChange: ( period: Period ) => void;
} ) {
	const atLatest = isLatestPeriod( period, today );

	return (
		<div style={ { display: 'flex', alignItems: 'center', gap: 8 } }>
			<SegmentedChip
				label="Timeframe"
				value={ period.unit }
				options={ UNITS }
				onChange={ ( unit ) =>
					onChange( currentPeriod( unit, today ) )
				}
			/>
			<ArrowButton
				direction="back"
				label="Previous period"
				onClick={ () => onChange( shiftPeriod( period, -1 ) ) }
			/>
			<Text
				variant="body-sm"
				style={ {
					minWidth: 0,
					whiteSpace: 'nowrap',
					fontVariantNumeric: 'tabular-nums',
				} }
			>
				{ periodLabel( period ) }
			</Text>
			<ArrowButton
				direction="forward"
				label="Next period"
				disabled={ atLatest }
				onClick={ () => onChange( shiftPeriod( period, 1 ) ) }
			/>
		</div>
	);
}

function ArrowButton( {
	direction,
	label,
	disabled = false,
	onClick,
}: {
	direction: 'back' | 'forward';
	label: string;
	disabled?: boolean;
	onClick: () => void;
} ) {
	return (
		<button
			type="button"
			aria-label={ label }
			disabled={ disabled }
			onClick={ onClick }
			style={ {
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: 28,
				height: 28,
				borderRadius: 999,
				border: '1px solid var(--wpds-color-stroke-surface-neutral)',
				background:
					'var(--wpds-color-background-surface-neutral-strong)',
				color: 'inherit',
				fontSize: 13,
				cursor: disabled ? 'default' : 'pointer',
				opacity: disabled ? 0.35 : 1,
				touchAction: 'manipulation',
			} }
		>
			{ direction === 'back' ? '‹' : '›' }
		</button>
	);
}
