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

// Coop receipt times are Stockholm wall-clock time with no UTC offset, and
// Convex runs in UTC. Inside the repeated hour at the end of DST this picks
// the later instant.
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
