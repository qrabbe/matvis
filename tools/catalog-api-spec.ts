/**
 * Regenerates the catalog's public API spec — the file the dev portal renders
 * its operation list from, and the artifact CI diffs.
 *
 * It holds what `convex function-spec` reports, read out of the source instead
 * of out of a deployment: every registered Convex function carries `exportArgs`
 * and `exportReturns`, so importing the module is enough. Reading it from source
 * is the point. It needs no deploy key, and it describes the code in the pull
 * request rather than whatever happens to be deployed while that request is
 * open. Field order follows the source; a deployment reports the same tree
 * sorted by field name.
 *
 *   bun run spec         write the file
 *   bun run spec:check   fail when the committed file is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as catalogModule from '../packages/catalog/convex/catalog';

/**
 * The one module the spec covers. `visibility` alone is not the filter it looks
 * like: the admin console's functions are registered public as well, gated at
 * runtime by a token rather than by registration, and none of them are part of
 * the promise the portal documents. Everything else — `raw.js`, `backfill.js`,
 * `ingest.js` — is `internal` and unreachable by any client.
 */
const MODULE = 'catalog.js';

const OUT = 'packages/catalog-portal/src/generated/catalog-api-spec.json';

/** The runtime surface `query()` and friends hang on a registered function. */
type RegisteredFunction = {
  isQuery?: boolean;
  isMutation?: boolean;
  isAction?: boolean;
  isPublic?: boolean;
  exportArgs: () => string;
  exportReturns: () => string;
};

function asRegistered(value: unknown): RegisteredFunction | null {
  if (typeof value !== 'function') return null;
  const fn = value as Partial<RegisteredFunction>;
  if (!fn.isQuery && !fn.isMutation && !fn.isAction) return null;
  return fn as RegisteredFunction;
}

function functionType(fn: RegisteredFunction): string {
  if (fn.isQuery) return 'Query';
  if (fn.isMutation) return 'Mutation';
  return 'Action';
}

const functions = Object.entries(catalogModule)
  .flatMap(([name, value]) => {
    const fn = asRegistered(value);
    if (!fn || !fn.isPublic) return [];
    return [
      {
        identifier: `${MODULE}:${name}`,
        functionType: functionType(fn),
        visibility: { kind: 'public' },
        args: JSON.parse(fn.exportArgs()),
        returns: JSON.parse(fn.exportReturns()),
      },
    ];
  })
  .sort((a, b) => a.identifier.localeCompare(b.identifier));

if (functions.length === 0) {
  console.error(`No public functions found in ${MODULE}.`);
  process.exit(1);
}

const json = `${JSON.stringify({ module: MODULE, functions }, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (readFileSync(OUT, 'utf8') === json) {
    console.log(`${OUT} is up to date`);
    process.exit(0);
  }
  console.error(
    `${OUT} no longer matches ${MODULE}.\n` +
      'The catalog contract changed. Run `bun run spec` and commit the result ' +
      'so the change shows up in this pull request.',
  );
  process.exit(1);
}

writeFileSync(OUT, json);
console.log(`wrote ${OUT} (${functions.length} functions)`);
