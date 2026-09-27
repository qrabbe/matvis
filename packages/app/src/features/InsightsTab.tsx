import { useMemo, useState } from 'react';
import { Text } from '@wordpress/ui';
import { PeriodPicker } from '../components/PeriodPicker';
import { NutritionInsights } from './NutritionInsights';
import { currentPeriod, periodRange, type Period } from '../lib/period';
import type { PurchaseData } from '../hooks/usePurchaseData';

export function InsightsTab( {
	data,
	token,
	today: todayProp,
}: {
	data: PurchaseData;
	token: string | null;
	/** Injectable for deterministic tests; defaults to the real clock. */
	today?: Date;
} ) {
	const today = useMemo( () => todayProp ?? new Date(), [ todayProp ] );
	const [ period, setPeriod ] = useState< Period >( () =>
		currentPeriod( 'week', today )
	);

	const range = useMemo(
		() => periodRange( period, today ),
		[ period, today ]
	);

	return (
		<div
			style={ {
				display: 'flex',
				flexDirection: 'column',
				height: '100%',
			} }
		>
			<div
				style={ {
					padding: '10px 14px 6px',
					borderBottom:
						'1px solid var(--wpds-color-stroke-surface-neutral)',
				} }
			>
				<Text variant="heading-md">Insights</Text>
			</div>

			<div
				style={ {
					flex: 1,
					overflowY: 'auto',
					padding: '10px 14px 20px',
				} }
			>
				<div style={ { display: 'grid', gap: 12 } }>
					<PeriodPicker
						period={ period }
						today={ today }
						onChange={ setPeriod }
					/>
					<NutritionInsights
						data={ data }
						token={ token }
						range={ range }
						bucketUnit={ period.unit === 'year' ? 'month' : 'day' }
						today={ today }
					/>
				</div>
			</div>
		</div>
	);
}
