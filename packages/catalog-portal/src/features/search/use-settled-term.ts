import { useEffect, useState } from 'react';

/**
 * Holds the typed term back until the typing stops, and lets Enter (or an
 * explicit `searchNow(term)`) skip the wait so the delay only ever costs
 * someone still deciding.
 */
export function useSettledTerm(
	typedTerm: string,
	delayMs: number
): {
	searchedTerm: string;
	waiting: boolean;
	searchNow: ( term?: string ) => void;
} {
	const [ searchedTerm, setSearchedTerm ] = useState( typedTerm );

	useEffect( () => {
		if ( typedTerm === searchedTerm ) {
			return;
		}
		const timer = setTimeout( () => setSearchedTerm( typedTerm ), delayMs );
		return () => clearTimeout( timer );
	}, [ typedTerm, searchedTerm, delayMs ] );

	return {
		searchedTerm,
		waiting: typedTerm !== searchedTerm,
		searchNow: ( term = typedTerm ) => setSearchedTerm( term ),
	};
}

export function waitingHint( typedTerm: string ): string {
	return typedTerm === ''
		? 'Clearing the search in a moment. Press Enter to clear it now.'
		: `Searching for “${ typedTerm }” in a moment. Press Enter to search now.`;
}
