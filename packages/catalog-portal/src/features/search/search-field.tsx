import { Icon, IconButton, InputControl } from '@wordpress/ui';
import { closeSmall, search } from '@wordpress/icons';
import { STORE_LABELS } from '@matvis/shared';
import type { CatalogStore } from '../../lib/route';
import { waitingHint } from './use-settled-term';

export function SearchField( {
	store,
	value,
	waiting,
	onChange,
	onEnter,
	onClear,
}: {
	store: CatalogStore;
	value: string;
	waiting: boolean;
	onChange: ( value: string ) => void;
	onEnter: () => void;
	onClear: () => void;
} ) {
	return (
		<InputControl
			type="search"
			label={ `Search ${ STORE_LABELS[ store ] }` }
			hideLabelFromVision
			placeholder={ `Search ${ STORE_LABELS[ store ] }` }
			description={ waiting ? waitingHint( value ) : undefined }
			value={ value }
			onValueChange={ onChange }
			onKeyDown={ ( event ) => {
				if ( event.key === 'Enter' ) {
					onEnter();
				}
			} }
			prefix={ <Icon icon={ search } /> }
			suffix={
				value ? (
					<IconButton
						label="Clear search"
						icon={ closeSmall }
						size="small"
						variant="minimal"
						tone="neutral"
						onClick={ onClear }
					/>
				) : undefined
			}
		/>
	);
}
