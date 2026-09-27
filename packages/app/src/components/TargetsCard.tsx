import type { ReactNode } from 'react';
import { Text } from '@wordpress/ui';
import { Panel } from './Panel';
import { formatNumber } from '../lib/format';
import { missesTarget, type TargetDirection } from '../lib/targets';
import type { Macros } from '../lib/nutrition';
import type { ResolvedTarget } from '../hooks/useSettings';

const WARNING = 'var(--wpds-color-foreground-content-warning)';

const BOUND_PREFIX: Record< TargetDirection, string > = {
	goal: '',
	atLeast: 'min ',
	atMost: 'max ',
};

export function TargetsCard( {
	dates,
	targets,
	perDay,
	children,
}: {
	dates: string;
	targets: readonly ResolvedTarget[];
	perDay: Macros;
	children?: ReactNode;
} ) {
	const shown = targets.filter( ( t ) => t.enabled );

	return (
		<Panel
			title="Per day vs your targets"
			aside={
				<Text
					variant="body-sm"
					style={ {
						opacity: 0.6,
						fontVariantNumeric: 'tabular-nums',
					} }
				>
					{ dates }
				</Text>
			}
		>
			{ shown.length === 0 ? (
				<Text variant="body-sm" style={ { opacity: 0.7 } }>
					Every target is off. Turn some on in Settings.
				</Text>
			) : (
				<div
					style={ {
						display: 'grid',
						gridTemplateColumns:
							'max-content minmax(40px, 1fr) max-content',
						alignItems: 'center',
						columnGap: 10,
						rowGap: 9,
					} }
				>
					{ shown.map( ( target ) => (
						<TargetRow
							key={ target.key }
							target={ target }
							perDay={ perDay[ target.macro ] }
						/>
					) ) }
				</div>
			) }
			{ children }
		</Panel>
	);
}

function TargetRow( {
	target,
	perDay,
}: {
	target: ResolvedTarget;
	perDay: number;
} ) {
	const missed = missesTarget( target.direction, perDay, target.value );
	return (
		<>
			<Text variant="body-sm">{ target.label }</Text>
			<TargetTrack
				perDay={ perDay }
				target={ target.value }
				missed={ missed }
			/>
			<Text
				variant="body-sm"
				style={ {
					textAlign: 'right',
					fontVariantNumeric: 'tabular-nums',
					color: missed ? WARNING : undefined,
				} }
			>
				{ `${ formatNumber( perDay ) } / ${ BOUND_PREFIX[ target.direction ] }${ formatNumber( target.value ) } ${ target.unit }` }
			</Text>
		</>
	);
}

function TargetTrack( {
	perDay,
	target,
	missed,
}: {
	perDay: number;
	target: number;
	missed: boolean;
} ) {
	const scale = Math.max( perDay, target );
	const fill = scale > 0 ? ( perDay / scale ) * 100 : 0;
	const goal = scale > 0 ? ( target / scale ) * 100 : 100;

	return (
		<div
			aria-hidden
			style={ {
				position: 'relative',
				height: 8,
				borderRadius: 4,
				background: 'var(--wpds-color-stroke-surface-neutral-weak)',
			} }
		>
			<span
				style={ {
					position: 'absolute',
					top: 0,
					bottom: 0,
					left: 0,
					width: `${ fill }%`,
					borderRadius: 4,
					background: missed
						? WARNING
						: 'var(--wpds-color-foreground-interactive-brand)',
				} }
			/>
			<span
				style={ {
					position: 'absolute',
					top: -3,
					bottom: -3,
					left: `calc(${ goal }% - 1px)`,
					width: 2,
					borderRadius: 1,
					background: 'var(--wpds-color-foreground-content-neutral)',
				} }
			/>
		</div>
	);
}
