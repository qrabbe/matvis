import { useCallback, useMemo } from 'react';
import { Text } from '@wordpress/ui';
import { TargetsCard } from '../components/TargetsCard';
import { EnergyChart } from '../components/EnergyChart';
import { IntakeSourcesCard } from '../components/IntakeSourcesCard';
import { WasteCard } from '../components/WasteCard';
import { useMarks } from '../hooks/useMarks';
import { useSettings } from '../hooks/useSettings';
import { dayKey, formatDayRange } from '../lib/format';
import {
	averagePerDay,
	eatenSpans,
	intakeByDay,
	wasteSummary,
} from '../lib/intake';
import {
	expandLinesToUnits,
	unitPrice,
	type PantryUnit,
} from '../lib/pantryUnits';
import { lineDiscounts } from '../lib/receiptLines';
import type { DateRange } from '../lib/dateRange';
import type { ChartBucketUnit } from '../lib/energyChart';
import type { PurchaseData } from '../hooks/usePurchaseData';

export function NutritionInsights( {
	data,
	token,
	range,
	bucketUnit,
	today,
}: {
	data: PurchaseData;
	token: string | null;
	range: DateRange;
	bucketUnit: ChartBucketUnit;
	today: Date;
} ) {
	const { marks } = useMarks( token );
	const { targets } = useSettings( token );

	const unitsByKey = useMemo(
		() =>
			new Map(
				expandLinesToUnits( data.lines ).map( ( u ) => [ u.key, u ] )
			),
		[ data.lines ]
	);
	const spans = useMemo(
		() => eatenSpans( marks, unitsByKey ),
		[ marks, unitsByKey ]
	);
	const days = useMemo( () => intakeByDay( spans ), [ spans ] );
	const perDay = useMemo(
		() => averagePerDay( days, range ),
		[ days, range ]
	);

	const discounts = useMemo(
		() => lineDiscounts( data.itemsByReceipt ),
		[ data.itemsByReceipt ]
	);
	const priceOf = useCallback(
		( unit: PantryUnit ) => unitPrice( unit, discounts ),
		[ discounts ]
	);

	const energy = targets.find( ( t ) => t.key === 'energy' );

	const month = useMemo( () => monthSoFar( today ), [ today ] );
	const waste = useMemo(
		() => wasteSummary( marks, unitsByKey, month, priceOf ),
		[ marks, unitsByKey, month, priceOf ]
	);

	const loading = data.loadingHeaders
		? 'Still loading receipts, so these numbers are incomplete.'
		: data.hydration.done < data.hydration.total
			? `Still loading receipts (${ data.hydration.done } of ${ data.hydration.total }), so these numbers are incomplete.`
			: null;

	return (
		<div style={ { display: 'grid', gap: 12 } }>
			<TargetsCard
				dates={ formatDayRange( range.from, range.to ) }
				targets={ targets }
				perDay={ perDay }
			>
				{ loading && (
					<Text variant="body-sm" style={ { opacity: 0.6 } }>
						{ loading }
					</Text>
				) }
			</TargetsCard>

			<EnergyChart
				intake={ days }
				range={ range }
				unit={ bucketUnit }
				today={ today }
				target={ energy?.enabled ? energy.value : null }
			/>

			<IntakeSourcesCard spans={ spans } range={ range } />

			<WasteCard
				summary={ waste }
				month={ today.toLocaleDateString( 'en-GB', { month: 'long' } ) }
			/>
		</div>
	);
}

function monthSoFar( today: Date ): DateRange {
	return {
		from: dayKey( new Date( today.getFullYear(), today.getMonth(), 1 ) ),
		to: dayKey( today ),
	};
}
