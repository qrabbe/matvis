export function formatKr( n: number | null | undefined ): string {
	if ( n === null || n === undefined || ! Number.isFinite( n ) ) {
		return '—';
	}
	return `${ Math.round( n ).toLocaleString( 'sv-SE' ) } kr`;
}

function pad2( n: number ): string {
	return String( n ).padStart( 2, '0' );
}

/**
 * Local time, deliberately not `toISOString()`, which shifts to UTC and files
 * an evening purchase under the next day.
 */
export function dayKey( date: Date ): string {
	return `${ date.getFullYear() }-${ pad2( date.getMonth() + 1 ) }-${ pad2( date.getDate() ) }`;
}

/** Must not become `new Date(key)`, which reads `YYYY-MM-DD` as UTC. */
export function parseDayKey( key: string ): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec( key );
	if ( ! match ) {
		return null;
	}
	const date = new Date(
		Number( match[ 1 ] ),
		Number( match[ 2 ] ) - 1,
		Number( match[ 3 ] )
	);
	return Number.isNaN( date.getTime() ) ? null : date;
}

export function formatDate( date: Date ): string {
	return `${ pad2( date.getDate() ) }.${ pad2( date.getMonth() + 1 ) }.${ date.getFullYear() }`;
}

export function formatDayMonth( key: string ): string {
	const date = parseDayKey( key );
	if ( ! date ) {
		return key;
	}
	return `${ pad2( date.getDate() ) }.${ pad2( date.getMonth() + 1 ) }`;
}

export function formatDayRange( from: string, to: string ): string {
	const start = parseDayKey( from );
	const end = parseDayKey( to );
	if ( ! start || ! end ) {
		return `${ from } – ${ to }`;
	}
	const sameYear = start.getFullYear() === end.getFullYear();
	return `${ sameYear ? formatDayMonth( from ) : formatDate( start ) } – ${ formatDate( end ) }`;
}

export function formatNumber( n: number ): string {
	const digits = Math.abs( n ) < 10 ? 1 : 0;
	return n.toLocaleString( 'sv-SE', { maximumFractionDigits: digits } );
}

export function formatDayShort( key: string ): string {
	const date = parseDayKey( key );
	if ( ! date ) {
		return key;
	}
	return date.toLocaleDateString( 'sv-SE', {
		day: 'numeric',
		month: 'short',
	} );
}

export function formatGrams( n: number | null | undefined ): string {
	if ( n === null || n === undefined || ! Number.isFinite( n ) ) {
		return '—';
	}
	return `${ Math.round( n ) } g`;
}

export function formatKcal( n: number | null | undefined ): string {
	if ( n === null || n === undefined || ! Number.isFinite( n ) ) {
		return '—';
	}
	return `${ Math.round( n ).toLocaleString( 'sv-SE' ) } kcal`;
}

export function formatPercent( part: number, total: number ): string {
	if ( total <= 0 ) {
		return '—';
	}
	return `${ Math.round( ( part / total ) * 100 ) }%`;
}

/**
 * ISO-8601 week number label ("Week 39"), used only to bucket the
 * receipts list, never to compute anything numeric, so ISO's Thursday-
 * anchored edge cases don't matter here.
 */
export function isoWeekLabel( date: Date ): string {
	const d = new Date(
		Date.UTC( date.getFullYear(), date.getMonth(), date.getDate() )
	);
	const day = d.getUTCDay() || 7;
	d.setUTCDate( d.getUTCDate() + 4 - day );
	const yearStart = new Date( Date.UTC( d.getUTCFullYear(), 0, 1 ) );
	const week = Math.ceil(
		( ( d.getTime() - yearStart.getTime() ) / 86_400_000 + 1 ) / 7
	);
	return `Week ${ week }`;
}
