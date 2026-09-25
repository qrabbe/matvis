#!/usr/bin/env bun
/**
 * One-time backfill: plays the account's receipt history forward against
 * `durationEstimates` (see `import-duration-estimates.ts`) and writes a
 * `source: 'backfill'` mark for every unit that would already be finished
 * before `--tracking-start`, so the pantry opens holding only what's
 * plausibly still there instead of every food line ever bought.
 *
 * Needs both deployments' URLs (from `packages/app/.env.local`, loaded
 * automatically by bun) and the account's own API token:
 *   VITE_CONVEX_URL          — the connector, to read receipts
 *   VITE_APP_CONVEX_URL      — this app's own backend, to read estimates
 *                               and write marks (unset by default; mint a
 *                               deployment and set this before running)
 *
 * Usage (from packages/app):
 *   bun run scripts/run-backfill.ts --token mv_xxx --tracking-start 2026-09-24
 *   bun run scripts/run-backfill.ts --token mv_xxx --tracking-start 2026-09-24 --dry-run
 */
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../src/lib/convexApi';
import { appBackendApi } from '../src/lib/appBackendApi';
import {
  simulateBackfill,
  type DurationEstimate,
} from '../src/lib/backfillSimulation';
import type { PurchaseLine } from '../src/lib/purchases';
import type { ReceiptHeader, ReceiptItemDoc } from '@matvis/shared';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function receiptDate(header: ReceiptHeader): Date {
  if (header.purchasedAt) {
    const parsed = new Date(header.purchasedAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (header.purchasedAtMs != null) return new Date(header.purchasedAtMs);
  return new Date(header._creationTime);
}

const CONCURRENCY = 8;

async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      for (;;) {
        const i = cursor++;
        const item = items[i];
        if (item === undefined) return;
        await task(item);
      }
    })(),
  );
  await Promise.all(workers);
}

async function main(): Promise<void> {
  const token = arg('token');
  const trackingStartRaw = arg('tracking-start');
  const dryRun = process.argv.includes('--dry-run');

  if (!token || !trackingStartRaw) {
    console.error(
      'Usage: bun run scripts/run-backfill.ts --token <account token> --tracking-start <YYYY-MM-DD> [--dry-run]',
    );
    process.exit(1);
  }
  const trackingStartMs = new Date(`${trackingStartRaw}T00:00:00`).getTime();
  if (!Number.isFinite(trackingStartMs)) {
    console.error(`--tracking-start "${trackingStartRaw}" did not parse`);
    process.exit(1);
  }

  const connectorUrl = process.env.VITE_CONVEX_URL;
  const appUrl = process.env.VITE_APP_CONVEX_URL;
  if (!connectorUrl) throw new Error('VITE_CONVEX_URL is not set');
  if (!appUrl) {
    throw new Error(
      'VITE_APP_CONVEX_URL is not set — this app has no deployment configured yet to write marks into',
    );
  }

  const connector = new ConvexHttpClient(connectorUrl);
  const appClient = new ConvexHttpClient(appUrl);

  console.log('Loading receipt headers…');
  const headers: ReceiptHeader[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await connector.query(api.receipts.list, {
      token,
      paginationOpts: { numItems: 200, cursor },
    });
    headers.push(...page.page);
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  console.log(`${headers.length} receipts.`);

  console.log('Loading receipt items…');
  const lines: PurchaseLine[] = [];
  await mapWithConcurrency(headers, CONCURRENCY, async (header) => {
    const detail = await connector.query(api.receipts.getReceipt, {
      token,
      receiptId: header._id,
    });
    if (!detail) return;
    const purchasedAt = receiptDate(header);
    const day = purchasedAt.toISOString().slice(0, 10);
    for (const item of detail.items as ReceiptItemDoc[]) {
      if (item.isDiscount) continue;
      lines.push({
        item,
        header,
        day,
        purchasedAt,
        product: null,
        macros: null,
      });
    }
  });
  console.log(`${lines.length} food lines.`);

  console.log('Loading duration estimates…');
  const estimateRows = await appClient.query(
    appBackendApi.durationEstimates.list,
    {},
  );
  const estimates = new Map<string, DurationEstimate>(
    estimateRows.map((row) => [
      row.groupKey,
      {
        daysToFinish: row.daysToFinish,
        maxDaysFromPurchase: row.maxDaysFromPurchase,
      },
    ]),
  );
  console.log(`${estimates.size} estimates.`);

  const marks = simulateBackfill(lines, estimates, trackingStartMs);
  console.log(`Backfill would write ${marks.length} marks.`);

  if (dryRun) {
    console.log('--dry-run: not writing anything.');
    return;
  }

  console.log('Writing marks…');
  let written = 0;
  await mapWithConcurrency(marks, CONCURRENCY, async (mark) => {
    await appClient.mutation(appBackendApi.marks.mark, {
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
    });
    written++;
    if (written % 20 === 0) console.log(`${written}/${marks.length}`);
  });
  console.log(`Done: ${written} marks written.`);
}

await main();
