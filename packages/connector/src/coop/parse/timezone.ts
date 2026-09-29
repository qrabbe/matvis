const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/;

const STOCKHOLM_PARTS = new Intl.DateTimeFormat( 'en-US', {
	timeZone: 'Europe/Stockholm',
	hourCycle: 'h23',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
} );

function stockholmOffsetMs( instantMs: number ): number {
	const parts = STOCKHOLM_PARTS.formatToParts( new Date( instantMs ) );
	const get = ( type: string ) =>
		Number( parts.find( ( p ) => p.type === type )?.value ?? 0 );
	const wallReadAsUtc = Date.UTC(
		get( 'year' ),
		get( 'month' ) - 1,
		get( 'day' ),
		get( 'hour' ),
		get( 'minute' ),
		get( 'second' )
	);
	return wallReadAsUtc - instantMs;
}

/**
 * Coop prints receipt timestamps ("Datum 2024-01-15 10:30", normalized by
 * `toIso` in `./metadata.ts` to "2024-01-15T10:30:00") with no UTC offset —
 * they are Stockholm wall-clock time off a till in a Swedish store.
 * `Date.parse` can't turn that into the right instant: an offset-less
 * date-time string is read in whatever zone the runtime itself is in (UTC on
 * Convex), not Stockholm's, and Stockholm's own offset from UTC changes
 * across the year (UTC+1 in winter, UTC+2 during DST).
 *
 * This guesses the instant by first reading the wall-clock numbers as UTC,
 * checks what Stockholm's offset actually is at that guessed instant, then
 * corrects for it — which is right except in the one hour a year the
 * Stockholm clock repeats (the DST-end fallback), an edge case not worth
 * resolving for receipts.
 */
export function stockholmWallTimeToUtcMs(
	wallTime: string
): number | undefined {
	const m = WALL_TIME.exec( wallTime );
	if ( ! m ) {
		return undefined;
	}
	const [ , year, month, day, hour, minute, second ] = m;
	const wallAsUtc = Date.UTC(
		Number( year ),
		Number( month ) - 1,
		Number( day ),
		Number( hour ),
		Number( minute ),
		Number( second ?? '0' )
	);
	return wallAsUtc - stockholmOffsetMs( wallAsUtc );
}
