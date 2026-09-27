#!/usr/bin/env bun
/**
 * One-time import of `data/itemGtinMap.coop.json` (the checked-in export of
 * confirmed links made in `matvis-linker`, a sibling tool outside this repo
 * — see its README) into this deployment's own `itemGtinMap` table via
 * `mappings:upsert`.
 *
 * Batches the upsert through `convex run` (rather than calling the mutation
 * over a client, which can't reach `internalMutation`s) in chunks small
 * enough to stay under a shell's command-line length limit.
 *
 * Usage (from packages/connector):
 *   bun run scripts/import-item-gtin-map.ts
 *   bun run scripts/import-item-gtin-map.ts --prod
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';

interface Row {
  store: string;
  normalizedText: string;
  kind: 'product' | 'produce' | 'notFood' | 'notInCatalog';
  gtin?: string;
  price?: number;
}

// `bunx`/`npx convex` resolve to a .cmd shim on Windows that mangles the
// double quotes out of a JSON arg before Convex ever sees it. Calling the
// bun-workspace-hoisted binary directly avoids that shim entirely (and is
// faster besides — no re-resolve on every call).
const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const CONVEX_BIN = (() => {
  const exe = join(REPO_ROOT, 'node_modules/.bin/convex.exe');
  if (existsSync(exe)) return exe;
  const shim = join(REPO_ROOT, 'node_modules/.bin/convex');
  if (existsSync(shim)) return shim;
  return null;
})();

const BATCH_SIZE = 25;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

async function main(): Promise<void> {
  const prod = process.argv.includes('--prod');
  const path = join(import.meta.dir, '..', 'data', 'itemGtinMap.coop.json');
  const rows: Row[] = JSON.parse(readFileSync(path, 'utf8'));

  console.log(`${rows.length} rows to upsert.`);

  let inserted = 0;
  let updated = 0;
  for (const batch of chunk(rows, BATCH_SIZE)) {
    const argsJson = JSON.stringify({
      rows: batch.map(({ store, normalizedText, kind, gtin, price }) => ({
        store,
        text: normalizedText,
        kind,
        gtin,
        price,
      })),
    });
    const bin = CONVEX_BIN ?? 'npx';
    const args = CONVEX_BIN
      ? ['run', 'mappings:upsert', argsJson]
      : ['convex', 'run', 'mappings:upsert', argsJson];
    if (prod) args.push('--prod');
    const out = await $`${bin} ${args}`.cwd(process.cwd()).text();
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
