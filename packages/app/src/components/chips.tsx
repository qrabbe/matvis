import type { CSSProperties } from 'react';

export interface ChipOption< T extends string > {
	value: T;
	label: string;
}

const chipStyle: CSSProperties = {
	minHeight: 32,
	padding: '0 12px',
	borderRadius: 999,
	border: '1px solid var(--wpds-color-stroke-surface-neutral)',
	background: 'var(--wpds-color-background-surface-neutral-strong)',
	color: 'inherit',
	font: 'inherit',
	fontSize: 12,
	whiteSpace: 'nowrap',
	touchAction: 'manipulation',
};

export function SelectChip< T extends string >( {
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: readonly ChipOption< T >[];
	onChange: ( value: T ) => void;
} ) {
	return (
		<span style={ { position: 'relative', display: 'inline-flex' } }>
			<select
				aria-label={ label }
				value={ value }
				onChange={ ( e ) => onChange( e.target.value as T ) }
				style={ {
					...chipStyle,
					appearance: 'none',
					paddingRight: 26,
					cursor: 'pointer',
				} }
			>
				{ options.map( ( option ) => (
					<option key={ option.value } value={ option.value }>
						{ option.label }
					</option>
				) ) }
			</select>
			<span
				aria-hidden
				style={ {
					position: 'absolute',
					right: 11,
					top: '50%',
					transform: 'translateY(-50%)',
					pointerEvents: 'none',
					fontSize: 8,
					opacity: 0.7,
				} }
			>
				▼
			</span>
		</span>
	);
}

export function SegmentedChip< T extends string >( {
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: readonly ChipOption< T >[];
	onChange: ( value: T ) => void;
} ) {
	return (
		<div
			role="group"
			aria-label={ label }
			style={ {
				display: 'inline-flex',
				gap: 2,
				padding: 2,
				borderRadius: 999,
				border: '1px solid var(--wpds-color-stroke-surface-neutral)',
				background:
					'var(--wpds-color-background-surface-neutral-strong)',
			} }
		>
			{ options.map( ( option ) => {
				const on = option.value === value;
				return (
					<button
						key={ option.value }
						type="button"
						aria-pressed={ on }
						onClick={ () => onChange( option.value ) }
						style={ {
							minHeight: 26,
							padding: '0 10px',
							borderRadius: 999,
							border: 'none',
							font: 'inherit',
							fontSize: 12,
							fontWeight: on ? 600 : 400,
							cursor: 'pointer',
							touchAction: 'manipulation',
							background: on
								? 'color-mix(in srgb, var(--wpds-color-foreground-interactive-brand) 20%, transparent)'
								: 'transparent',
							color: on
								? 'var(--wpds-color-foreground-interactive-brand)'
								: 'inherit',
						} }
					>
						{ option.label }
					</button>
				);
			} ) }
		</div>
	);
}
