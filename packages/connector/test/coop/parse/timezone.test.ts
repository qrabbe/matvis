import { describe, expect, it } from 'bun:test';
import { stockholmWallTimeToUtcMs } from '../../../src/coop/parse/timezone';

describe( 'stockholmWallTimeToUtcMs', () => {
	it( 'applies the winter (CET, UTC+1) offset', () => {
		expect( stockholmWallTimeToUtcMs( '2026-01-09T12:34:00' ) ).toBe(
			Date.UTC( 2026, 0, 9, 11, 34, 0 )
		);
	} );

	it( 'applies the summer (CEST, UTC+2) offset', () => {
		expect( stockholmWallTimeToUtcMs( '2026-07-09T12:34:00' ) ).toBe(
			Date.UTC( 2026, 6, 9, 10, 34, 0 )
		);
	} );

	it( 'rolls a near-midnight wall time back into the previous UTC day', () => {
		expect( stockholmWallTimeToUtcMs( '2026-01-01T00:15:00' ) ).toBe(
			Date.UTC( 2025, 11, 31, 23, 15, 0 )
		);
	} );

	it( 'defaults seconds to :00 when the input omits them', () => {
		expect( stockholmWallTimeToUtcMs( '2026-01-09T12:34' ) ).toBe(
			Date.UTC( 2026, 0, 9, 11, 34, 0 )
		);
	} );

	it( 'returns undefined for an unparseable string', () => {
		expect( stockholmWallTimeToUtcMs( 'not-a-date' ) ).toBeUndefined();
	} );
} );
