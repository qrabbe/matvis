import { useMemo, useState } from 'react';
import { Text } from '@wordpress/ui';
import { Panel } from './Panel';
import { useElementWidth } from '../hooks/useElementWidth';
import {
	energyBars,
	niceCeiling,
	type ChartBucketUnit,
	type EnergyBar,
} from '../lib/energyChart';
import { rangeLengthDays, type DateRange } from '../lib/dateRange';
import {
	dayKey,
	formatDayMonth,
	formatNumber,
	parseDayKey,
} from '../lib/format';
import type { DayIntake } from '../lib/intake';

const MARKED = 'var(--wpds-color-foreground-interactive-brand)';
const INK = 'var(--wpds-color-foreground-content-neutral)';
const MUTED = 'var(--wpds-color-foreground-content-neutral-weak)';
const GRID = 'var(--wpds-color-stroke-surface-neutral-weak)';

const HEIGHT = 168;
const TOP = 20;
const BOTTOM = 146;
const LEFT = 34;
const RIGHT_PAD = 2;
const FONT = 10;
const LABEL_HALF_WIDTH = 15;

export function EnergyChart( {
	intake,
	range,
	unit,
	today,
	target,
}: {
	intake: readonly DayIntake[];
	range: DateRange;
	unit: ChartBucketUnit;
	today: Date;
	target: number | null;
} ) {
	const [ selected, setSelected ] = useState< number | null >( null );
	const [ wrapRef, width ] = useElementWidth< HTMLDivElement >( 320 );

	const bars = useMemo(
		() => energyBars( intake, range, unit, today ),
		[ intake, range, unit, today ]
	);

	const todayKey = dayKey( today );
	const right = width - RIGHT_PAD;
	const slot = ( right - LEFT ) / bars.length;
	const barWidth = Math.max( 2, slot * 0.7 );
	const peak = Math.max( target ?? 0, ...bars.map( ( b ) => b.marked ) );
	const axis = niceCeiling( peak * 1.05 );
	const y = ( kcal: number ) =>
		BOTTOM - ( kcal / axis.max ) * ( BOTTOM - TOP );
	const current = bars.findIndex( ( b ) => b.includesToday );
	const currentBar = bars[ current ];
	const todayX =
		currentBar && unit === 'day'
			? LEFT + ( current + 0.5 ) * slot
			: currentBar
				? LEFT +
					( current +
						rangeLengthDays( {
							from: currentBar.from,
							to: todayKey,
						} ) /
							rangeLengthDays( currentBar ) ) *
						slot
				: null;
	const labelEvery =
		unit === 'day' ? Math.max( 1, Math.round( bars.length / 8 ) ) : 1;
	const ticks: number[] = [];
	for ( let v = axis.step; v <= axis.max; v += axis.step ) {
		ticks.push( v );
	}

	if ( selected !== null && selected >= bars.length ) {
		setSelected( null );
	}

	return (
		<Panel title="Energy per day">
			<div ref={ wrapRef } style={ { width: '100%' } }>
				<svg
					width={ width }
					height={ HEIGHT }
					viewBox={ `0 0 ${ width } ${ HEIGHT }` }
					role="img"
					aria-label={ chartLabel( bars, target ) }
					style={ { display: 'block', touchAction: 'manipulation' } }
				>
					<line
						x1={ LEFT }
						x2={ right }
						y1={ BOTTOM }
						y2={ BOTTOM }
						stroke={ GRID }
					/>
					{ ticks.map( ( v ) => (
						<g key={ v }>
							<line
								x1={ LEFT }
								x2={ right }
								y1={ y( v ) }
								y2={ y( v ) }
								stroke={ GRID }
							/>
							<text
								x={ LEFT - 6 }
								y={ y( v ) + FONT / 3 }
								textAnchor="end"
								fontSize={ FONT }
								fill={ MUTED }
							>
								{ formatNumber( v ) }
							</text>
						</g>
					) ) }

					{ selected !== null && (
						<rect
							x={ LEFT + selected * slot }
							y={ TOP }
							width={ slot }
							height={ BOTTOM - TOP }
							fill={ INK }
							opacity={ 0.08 }
						/>
					) }

					{ bars.map( ( bar, i ) => {
						if ( ! ( bar.marked > 0 ) ) {
							return null;
						}
						const x = LEFT + i * slot + ( slot - barWidth ) / 2;
						const top = y( bar.marked );
						return (
							<rect
								key={ bar.from }
								x={ x }
								y={ top }
								width={ barWidth }
								height={ BOTTOM - top }
								rx={ Math.min( 1.5, barWidth / 4 ) }
								fill={ MARKED }
							/>
						);
					} ) }

					{ target !== null && (
						<g>
							<line
								x1={ LEFT }
								x2={ right }
								y1={ y( target ) }
								y2={ y( target ) }
								stroke={ INK }
								strokeWidth={ 1.2 }
								strokeDasharray="5 4"
							/>
							<text
								x={ right }
								y={ y( target ) - 4 }
								textAnchor="end"
								fontSize={ FONT }
								fill={ MUTED }
							>
								{ `target ${ formatNumber( target ) }` }
							</text>
						</g>
					) }

					{ todayX !== null && (
						<g>
							<line
								x1={ todayX }
								x2={ todayX }
								y1={ TOP - 6 }
								y2={ BOTTOM }
								stroke={ INK }
								strokeWidth={ 1.2 }
							/>
							<text
								x={
									right - todayX < 30
										? todayX - 4
										: todayX + 4
								}
								y={ FONT }
								textAnchor={
									right - todayX < 30 ? 'end' : 'start'
								}
								fontSize={ FONT }
								fontWeight={ 600 }
								fill={ INK }
							>
								today
							</text>
						</g>
					) }

					{ bars.map( ( bar, i ) => {
						const isLast = i === bars.length - 1;
						if ( ! isLast ) {
							if ( i % labelEvery !== 0 ) {
								return null;
							}
							// The last bar always gets a label; skip one that would sit
							// right next to it.
							if ( bars.length - 1 - i < labelEvery ) {
								return null;
							}
						}
						const center = LEFT + i * slot + slot / 2;
						const nearEdge = center + LABEL_HALF_WIDTH > right;
						return (
							<text
								key={ bar.from }
								x={ nearEdge ? right : center }
								y={ BOTTOM + FONT + 6 }
								textAnchor={ nearEdge ? 'end' : 'middle' }
								fontSize={ FONT }
								fill={ MUTED }
							>
								{ bar.label }
							</text>
						);
					} ) }

					{ bars.map( ( bar, i ) => (
						<rect
							key={ bar.from }
							x={ LEFT + i * slot }
							y={ TOP }
							width={ slot }
							height={ BOTTOM - TOP + FONT + 8 }
							fill="transparent"
							style={ { cursor: 'pointer' } }
							onClick={ () =>
								setSelected( ( s ) => ( s === i ? null : i ) )
							}
						/>
					) ) }
				</svg>
			</div>

			<Text
				variant="body-sm"
				aria-live="polite"
				style={ {
					minHeight: '1.4em',
					opacity: selected === null ? 0.6 : 1,
				} }
			>
				{ selected === null || ! bars[ selected ]
					? 'Tap a bar for its numbers.'
					: readout( bars[ selected ], unit, todayKey ) }
			</Text>

			<LegendItem swatch={ MARKED } label="Marked finished" />
		</Panel>
	);
}

function readout(
	bar: EnergyBar,
	unit: ChartBucketUnit,
	todayKey: string
): string {
	const when =
		unit === 'day'
			? `${ weekday( bar.from ) } ${ formatDayMonth( bar.from ) }`
			: `${ monthName( bar.from ) }, per day`;
	if ( ! ( bar.marked > 0 ) ) {
		return [
			when,
			bar.from > todayKey ? 'nothing forecast' : 'nothing counted yet',
		].join( ' · ' );
	}
	return `${ when } · ${ formatNumber( bar.marked ) } kcal marked`;
}

function weekday( key: string ): string {
	const date = parseDayKey( key );
	return date ? date.toLocaleDateString( 'en-GB', { weekday: 'short' } ) : '';
}

function monthName( key: string ): string {
	const date = parseDayKey( key );
	return date ? date.toLocaleDateString( 'en-GB', { month: 'long' } ) : key;
}

function chartLabel(
	bars: readonly EnergyBar[],
	target: number | null
): string {
	const first = bars[ 0 ];
	const last = bars.at( -1 );
	if ( ! first || ! last ) {
		return 'Energy per day';
	}
	const range = `${ formatDayMonth( first.from ) } to ${ formatDayMonth( last.to ) }`;
	const goal =
		target !== null ? `, target ${ formatNumber( target ) } kcal` : '';
	return `Energy per day from ${ range }: marked finished${ goal }.`;
}

function LegendItem( { swatch, label }: { swatch: string; label: string } ) {
	return (
		<span
			style={ { display: 'inline-flex', alignItems: 'center', gap: 6 } }
		>
			<span
				aria-hidden
				style={ {
					width: 10,
					height: 10,
					borderRadius: 3,
					background: swatch,
					flexShrink: 0,
				} }
			/>
			<Text variant="body-sm" style={ { opacity: 0.7 } }>
				{ label }
			</Text>
		</span>
	);
}
