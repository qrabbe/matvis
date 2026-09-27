import { STORES, STORE_LABELS, type StoreSlug } from '@matvis/shared';
import coop from '../assets/stores/coop.svg';
import ica from '../assets/stores/ica.svg';
import willys from '../assets/stores/willys.svg';
import hemkop from '../assets/stores/hemkop.svg';
import lidl from '../assets/stores/lidl.svg';
import citygross from '../assets/stores/citygross.svg';

const LOGOS: Partial< Record< StoreSlug, string > > = {
	coop,
	ica,
	willys,
	hemkop,
	lidl,
	citygross,
};

export type Chain = { slug: StoreSlug; label: string; src: string };

export const ALL_CHAINS: Chain[] = STORES.filter(
	( slug ) => slug in LOGOS
).map( ( slug ) => ( {
	slug,
	label: STORE_LABELS[ slug ],
	src: LOGOS[ slug ]!,
} ) );

/** Coop is the only chain linked through the connector today. */
export const CONNECTED_CHAINS: Chain[] = ALL_CHAINS.filter(
	( chain ) => chain.slug === 'coop'
);
