#!/usr/bin/env bun
/**
 * One-time import of the reviewed backfill estimates
 * (`tickets/backfill/durations.json`, repo root) into this app's own
 * `durationEstimates` table — `durations.ts`'s tier 2, read whenever a
 * product has fewer than two of the account's own teaching marks.
 *
 * Translates the backfill file's own key scheme (`ean:<gtin>` /
 * `text:<store>:<normalizedText>`) into `pantryGroupKey`'s scheme
 * (`product:<gtin>` / `produce:<normalizedText>`) so every reader of this
 * table shares one key format. The store prefix on a `text:` key is
 * dropped — `itemGtinMap` and this account are Coop-only today; a second
 * store's produce texts would need revisiting this if they ever collide.
 *
 * Batches the upsert through `bunx convex run` (rather than calling the
 * internal mutation over a client, which can't reach `internalMutation`s)
 * in chunks small enough to stay under a shell's command-line length limit.
 *
 * Usage (from packages/app):
 *   bun run scripts/import-duration-estimates.ts
 *   bun run scripts/import-duration-estimates.ts --prod
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface BackfillEntry {
  key: string;
  label: string;
  daysToFinish: number;
  daysOnceOpened?: number;
  isFood?: boolean;
  singleUse?: boolean;
  maxDaysFromPurchase?: number;
  confidence?: string;
  reason?: string;
  source: string;
}

interface Estimate {
  groupKey: string;
  label: string;
  daysToFinish: number;
  daysOnceOpened?: number;
  maxDaysFromPurchase?: number;
  singleUse?: boolean;
  source: string;
}

function toGroupKey(backfillKey: string): string | null {
  if (backfillKey.startsWith('ean:')) {
    return `product:${backfillKey.slice('ean:'.length)}`;
  }
  const textMatch = /^text:[^:]+:(.+)$/.exec(backfillKey);
  if (textMatch) return `produce:${textMatch[1]}`;
  return null;
}

const BATCH_SIZE = 20;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

async function main(): Promise<void> {
  const prod = process.argv.includes('--prod');
  const path = join(
    import.meta.dir,
    '..',
    '..',
    '..',
    'tickets',
    'backfill',
    'durations.json',
  );
  const entries: BackfillEntry[] = JSON.parse(readFileSync(path, 'utf8'));

  const estimates: Estimate[] = [];
  let skippedNonFood = 0;
  let skippedUnkeyable = 0;
  for (const entry of entries) {
    if (entry.isFood === false) {
      skippedNonFood++;
      continue;
    }
    const groupKey = toGroupKey(entry.key);
    if (!groupKey) {
      skippedUnkeyable++;
      continue;
    }
    estimates.push({
      groupKey,
      label: entry.label,
      daysToFinish: entry.daysToFinish,
      daysOnceOpened: entry.daysOnceOpened,
      maxDaysFromPurchase: entry.maxDaysFromPurchase,
      singleUse: entry.singleUse,
      source: entry.source,
    });
  }

  console.log(
    `${entries.length} backfill entries → ${estimates.length} estimates ` +
      `(${skippedNonFood} non-food, ${skippedUnkeyable} unkeyable skipped)`,
  );

  let inserted = 0;
  let updated = 0;
  for (const batch of chunk(estimates, BATCH_SIZE)) {
    const args = [
      'convex',
      'run',
      'durationEstimates:upsert',
      JSON.stringify({ estimates: batch }),
    ];
    if (prod) args.push('--prod');
    const result = Bun.spawnSync(['bunx', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (result.exitCode !== 0) {
      console.error(result.stderr.toString());
      throw new Error(`convex run failed on a batch of ${batch.length}`);
    }
    const out = result.stdout.toString();
    console.log(out.trim());
    const parsed = /"inserted":(\d+),"updated":(\d+)/.exec(
      out.replace(/\s/g, ''),
    );
    if (parsed) {
      inserted += Number(parsed[1]);
      updated += Number(parsed[2]);
    }
  }

  console.log(`Done: ${inserted} inserted, ${updated} updated.`);
}

await main();
