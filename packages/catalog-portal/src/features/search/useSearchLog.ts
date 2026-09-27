import { useEffect, useRef } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../lib/convexApi';
import { visitorId } from '../../lib/visitor';

/**
 * Records a term once it has settled and its first page has arrived: not
 * once per keystroke, not once per page of results, and never for the empty
 * term, since browsing everything is not a search.
 */
export function useSearchLog(
	term: string,
	status: string,
	resultCount: number
): void {
	const logSearch = useMutation( api.search.logSearch );
	const logged = useRef< string | null >( null );

	useEffect( () => {
		if ( term === '' ) {
			return;
		}
		if ( status === 'LoadingFirstPage' ) {
			return;
		}
		if ( logged.current === term ) {
			return;
		}

		logged.current = term;
		void logSearch( {
			term,
			visitor: visitorId(),
			results: resultCount,
		} ).catch( () => {} );
	}, [ term, status, resultCount, logSearch ] );
}
