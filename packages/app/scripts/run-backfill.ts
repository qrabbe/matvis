#!/usr/bin/env bun
/**
 * One-time backfill: plays the account's receipt history forward against
 * `durationEstimates` (see `import-duration-estimates.ts`) and writes a
 * `source: 'backfill'` mark for every unit that would already be finished
 * before `--tracking-start`, so the pantry opens holding only what's
 * plausibly still there instead of every food line ever bought. Re-running
 * this clears every `source: 'backfill'` mark from a previous run first, so
 * it's safe to re-run after changing the estimates or the simulation rule.
 *
 * Needs both deployments' URLs (from `packages/app/.env.local`, loaded
 * automatically by bun) and the account's own API token:
 *   VITE_CONNECTOR_CONVEX_URL — the connector, to read receipts
 *   VITE_APP_CONVEX_URL       — this app's own backend, to read estimates
 *                                and write marks (unset by default; mint a
 *                                deployment and set this before running)
 *
 * `--shard i/N` restricts the run to the i-th of N slices of product
 * groups (split by a hash of the group key), so several invocations can
 * run at once without writing the same unit twice. Only one of them should
 * clear the previous run's marks first — pass `--skip-clear` to the rest,
 * or clear once up front with `--clear-only` (which does nothing else).
 *
 * Usage (from packages/app):
 *   bun run scripts/run-backfill.ts --token mv_xxx --tracking-start 2026-09-24
 *   bun run scripts/run-backfill.ts --token mv_xxx --tracking-start 2026-09-24 --dry-run
 *   bun run scripts/run-backfill.ts --token mv_xxx --clear-only
 *   bun run scripts/run-backfill.ts --token mv_xxx --tracking-start 2026-09-24 --shard 0/4 --skip-clear
 */
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../src/lib/convexApi';
import { appBackendApi } from '../src/lib/appBackendApi';
import {
	simulateBackfill,
	type DurationEstimate,
} from '../src/lib/backfillSimulation';
import { expandLineToUnits, pantryGroupKey } from '../src/lib/pantryUnits';
import type { PurchaseLine } from '../src/lib/purchases';
import type { ReceiptHeader, ReceiptItemDoc } from '@matvis/shared';

function arg( name: string ): string | undefined {
	const i = process.argv.indexOf( `--${ name }` );
	return i >= 0 ? process.argv[ i + 1 ] : undefined;
}

/**
 * A stable, even-enough split of group keys across shards — this only
 * needs to keep each unit in exactly one shard, not to be cryptographic.
 */
function hashString( s: string ): number {
	let h = 5381;
	for ( let i = 0; i < s.length; i++ ) {
		h = ( h * 33 ) ^ s.charCodeAt( i );
	}
	return h >>> 0;
}

function shardKeyOf( line: PurchaseLine ): string {
	const unit = expandLineToUnits( line )[ 0 ]!;
	return pantryGroupKey( unit ) ?? `line:${ line.item._id }`;
}

function receiptDate( header: ReceiptHeader ): Date {
	if ( header.purchasedAt ) {
		const parsed = new Date( header.purchasedAt );
		if ( ! Number.isNaN( parsed.getTime() ) ) {
			return parsed;
		}
	}
	if ( header.purchasedAtMs != null ) {
		return new Date( header.purchasedAtMs );
	}
	return new Date( header._creationTime );
}

const CONCURRENCY = 8;

async function mapWithConcurrency< T >(
	items: readonly T[],
	limit: number,
	task: ( item: T ) => Promise< void >
): Promise< void > {
	let cursor = 0;
	const workers = Array.from(
		{ length: Math.min( limit, items.length ) },
		() =>
			( async () => {
				for (;;) {
					const i = cursor++;
					const item = items[ i ];
					if ( item === undefined ) {
						return;
					}
					await task( item );
				}
			} )()
	);
	await Promise.all( workers );
}

async function clearBackfillMarks(
	appClient: ConvexHttpClient,
	token: string
): Promise< void > {
	console.log( 'Loading existing marks…' );
	const existingMarks = await appClient.query( appBackendApi.marks.list, {
		token,
	} );
	const staleBackfillMarks = existingMarks.filter(
		( m ) => m.source === 'backfill'
	);
	console.log(
		`Clearing ${ staleBackfillMarks.length } previous backfill marks…`
	);
	await mapWithConcurrency( staleBackfillMarks, CONCURRENCY, async ( m ) => {
		await appClient.mutation( appBackendApi.marks.unmark, {
			token,
			receiptId: m.receiptId,
			lineNo: m.lineNo,
			unitIndex: m.unitIndex,
		} );
	} );
}

async function main(): Promise< void > {
	const token = arg( 'token' );
	const dryRun = process.argv.includes( '--dry-run' );
	const clearOnly = process.argv.includes( '--clear-only' );
	const skipClear = process.argv.includes( '--skip-clear' );
	const shardArg = arg( 'shard' );

	if ( ! token ) {
		console.error(
			'Usage: bun run scripts/run-backfill.ts --token <account token> --tracking-start <YYYY-MM-DD> [--dry-run] [--shard i/N] [--skip-clear]\n' +
				'   or: bun run scripts/run-backfill.ts --token <account token> --clear-only'
		);
		process.exit( 1 );
	}

	const appUrl = process.env.VITE_APP_CONVEX_URL;
	if ( ! appUrl ) {
		throw new Error(
			'VITE_APP_CONVEX_URL is not set — this app has no deployment configured yet to write marks into'
		);
	}
	const appClient = new ConvexHttpClient( appUrl );

	if ( clearOnly ) {
		await clearBackfillMarks( appClient, token );
		console.log( 'Done: cleared, nothing else to do with --clear-only.' );
		return;
	}

	let shardIndex: number | null = null;
	let shardCount: number | null = null;
	if ( shardArg ) {
		const parsed = /^(\d+)\/(\d+)$/.exec( shardArg );
		if ( ! parsed ) {
			console.error(
				'--shard must look like "0/4" (this shard / total)'
			);
			process.exit( 1 );
		}
		shardIndex = Number( parsed[ 1 ] );
		shardCount = Number( parsed[ 2 ] );
	}

	const trackingStartRaw =
		arg( 'tracking-start' ) ?? new Date().toISOString().slice( 0, 10 );
	const trackingStartMs = new Date(
		`${ trackingStartRaw }T00:00:00`
	).getTime();
	if ( ! Number.isFinite( trackingStartMs ) ) {
		console.error(
			`--tracking-start "${ trackingStartRaw }" did not parse`
		);
		process.exit( 1 );
	}
	console.log( `Tracking start: ${ trackingStartRaw }` );

	const connectorUrl = process.env.VITE_CONNECTOR_CONVEX_URL;
	if ( ! connectorUrl ) {
		throw new Error( 'VITE_CONNECTOR_CONVEX_URL is not set' );
	}
	const connector = new ConvexHttpClient( connectorUrl );

	console.log( 'Loading receipt headers…' );
	const headers: ReceiptHeader[] = [];
	let cursor: string | null = null;
	for (;;) {
		const page = await connector.query( api.receipts.list, {
			token,
			paginationOpts: { numItems: 200, cursor },
		} );
		headers.push( ...page.page );
		if ( page.isDone ) {
			break;
		}
		cursor = page.continueCursor;
	}
	console.log( `${ headers.length } receipts.` );

	console.log( 'Loading receipt items…' );
	const lines: PurchaseLine[] = [];
	await mapWithConcurrency( headers, CONCURRENCY, async ( header ) => {
		const detail = await connector.query( api.receipts.getReceipt, {
			token,
			receiptId: header._id,
		} );
		if ( ! detail ) {
			return;
		}
		const purchasedAt = receiptDate( header );
		const day = purchasedAt.toISOString().slice( 0, 10 );
		for ( const item of detail.items as ReceiptItemDoc[] ) {
			if ( item.isDiscount ) {
				continue;
			}
			lines.push( {
				item,
				header,
				day,
				purchasedAt,
				product: null,
				macros: null,
			} );
		}
	} );
	console.log( `${ lines.length } food lines.` );

	const shardedLines =
		shardCount !== null
			? lines.filter(
					( line ) =>
						hashString( shardKeyOf( line ) ) % shardCount ===
						shardIndex
				)
			: lines;
	if ( shardCount !== null ) {
		console.log(
			`${ shardedLines.length } food lines in shard ${ shardIndex }/${ shardCount }.`
		);
	}

	console.log( 'Loading duration estimates…' );
	const estimateRows = await appClient.query(
		appBackendApi.durationEstimates.list,
		{}
	);
	const estimates = new Map< string, DurationEstimate >(
		estimateRows.map( ( row ) => [
			row.groupKey,
			{
				daysToFinish: row.daysToFinish,
				maxDaysFromPurchase: row.maxDaysFromPurchase,
			},
		] )
	);
	console.log( `${ estimates.size } estimates.` );

	const marks = simulateBackfill( shardedLines, estimates, trackingStartMs );
	console.log( `Backfill would write ${ marks.length } marks.` );

	if ( dryRun ) {
		console.log( '--dry-run: not writing anything.' );
		return;
	}

	if ( ! skipClear ) {
		await clearBackfillMarks( appClient, token );
	}

	console.log( 'Writing marks…' );
	let written = 0;
	await mapWithConcurrency( marks, CONCURRENCY, async ( mark ) => {
		await appClient.mutation( appBackendApi.marks.mark, {
			token,
			receiptId: mark.receiptId,
			lineNo: mark.lineNo,
			unitIndex: mark.unitIndex,
			outcome: 'finished',
			finishedAt: mark.finishedAt,
			startedAt: mark.startedAt,
			finishedAtHandSet: false,
			via: 'backfill',
			source: 'backfill',
		} );
		written++;
		if ( written % 20 === 0 ) {
			console.log( `${ written }/${ marks.length }` );
		}
	} );
	console.log( `Done: ${ written } marks written.` );
}

await main();
