/**
 * Builds every frontend and records the size of what Vite emitted, so a chunk
 * that suddenly grows fails the pull request that caused it.
 *
 * The gate exists for the code splitting in `packages/app`: the seven panels
 * load through `React.lazy` so that recharts and dataviews stay out of the entry
 * chunk. A stray top level import collapses that, and nothing about the diff
 * says so. A byte count does, and unlike a wall clock benchmark it is the same
 * number on every runner.
 *
 *   bun run size         write bundle-size.json
 *   bun run size:check   fail when a chunk grew past its budget
 *
 * Budgets are a tolerance rather than an exact match, because a dependency bump
 * moves minified output by a few hundred bytes and a byte exact gate would fail
 * on every `bun update`. The entry chunk gets the tightest one: a lazy chunk
 * growing is ordinary, an entry chunk growing usually means something stopped
 * being lazy.
 *
 * When the gate fires legitimately, rerun `bun run size` and commit the new
 * baseline in the same pull request. That is the point: a deliberate size
 * increase becomes a visible line in the diff.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const OUT = 'bundle-size.json';

const BUILDS = [
  { pkg: '@matvis/landing', dir: 'packages/landing' },
  { pkg: '@matvis/connector-portal', dir: 'packages/connector-portal' },
  { pkg: '@matvis/catalog-portal', dir: 'packages/catalog-portal' },
  { pkg: '@matvis/app', dir: 'packages/app' },
];

/**
 * Placeholder deployment URLs. The builds bake `VITE_*` into the bundle, so a
 * developer's `.env.local` would otherwise make the local numbers differ from
 * CI's by the length of their deployment names. Vite lets a real process env var
 * win over a `.env` file, so setting them here pins the measurement.
 */
const BUILD_ENV = {
  PORTAL_BASE: '/',
  VITE_CONVEX_URL: 'https://bundle-size-placeholder.convex.cloud',
  VITE_CATALOG_CONVEX_URL: 'https://bundle-size-placeholder.convex.cloud',
};

/** Allowance on top of a recorded size, as a fraction plus an absolute floor. */
type Tolerance = { fraction: number; floor: number };

const TOLERANCE: Record<'entry' | 'chunk' | 'total', Tolerance> = {
  entry: { fraction: 0.02, floor: 2048 },
  chunk: { fraction: 0.05, floor: 4096 },
  total: { fraction: 0.05, floor: 8192 },
};

type Measurement = {
  /** Chunk key of the module script `index.html` loads. */
  entry: string;
  /** Every emitted file, `dist/` included, not just the scripts. */
  totalBytes: number;
  /** Hash stripped file name to byte count, for the scripts and stylesheets. */
  chunks: Record<string, number>;
};

const check = process.argv.includes('--check');

const measurements: Record<string, Measurement> = {};
for (const build of BUILDS) {
  console.log(`building ${build.pkg}`);
  const result = Bun.spawnSync(['bun', 'run', '--filter', build.pkg, 'build'], {
    env: { ...(process.env as Record<string, string>), ...BUILD_ENV },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (result.exitCode !== 0) {
    console.error(`${build.pkg} build failed`);
    process.exit(result.exitCode ?? 1);
  }
  measurements[build.pkg] = measure(`${build.dir}/dist`);
}

const json = `${JSON.stringify({ tolerance: TOLERANCE, builds: measurements }, null, 2)}\n`;

if (!check) {
  writeFileSync(OUT, json);
  for (const [pkg, measured] of Object.entries(measurements)) {
    console.log(
      `${pkg}: entry ${kb(measured.chunks[measured.entry] ?? 0)}, ` +
        `total ${kb(measured.totalBytes)} across ${Object.keys(measured.chunks).length} chunks`,
    );
  }
  console.log(`wrote ${OUT}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(OUT, 'utf8')) as {
  builds: Record<string, Measurement>;
};

const failures: string[] = [];
for (const build of BUILDS) {
  const measured = measurements[build.pkg] as Measurement;
  const recorded = baseline.builds[build.pkg];
  if (!recorded) {
    failures.push(`${build.pkg} is missing from ${OUT}`);
    continue;
  }

  compare(
    build.pkg,
    'total',
    recorded.totalBytes,
    measured.totalBytes,
    'total',
  );

  const entryBytes = measured.chunks[recorded.entry];
  if (entryBytes === undefined) {
    failures.push(
      `${build.pkg}: entry chunk ${recorded.entry} is gone from the build`,
    );
  } else {
    compare(
      build.pkg,
      recorded.entry,
      recorded.chunks[recorded.entry] ?? 0,
      entryBytes,
      'entry',
    );
  }

  for (const [name, was] of Object.entries(recorded.chunks)) {
    if (name === recorded.entry) continue;
    const now = measured.chunks[name];
    // A chunk that vanished either shrank to nothing or was folded into
    // another one. The entry and total budgets above catch where it went.
    if (now === undefined) {
      console.log(`${build.pkg}: chunk ${name} is no longer emitted`);
      continue;
    }
    compare(build.pkg, name, was, now, 'chunk');
  }

  for (const name of Object.keys(measured.chunks)) {
    if (!(name in recorded.chunks)) {
      console.log(
        `${build.pkg}: new chunk ${name} at ${kb(measured.chunks[name] as number)}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`\nBundle size regressed:\n${failures.join('\n')}`);
  console.error(
    '\nIf the growth is deliberate, run `bun run size` and commit the new ' +
      `${OUT} in the same pull request.`,
  );
  process.exit(1);
}

console.log(`\nevery build is within its ${OUT} budget`);

/** Records one build's emitted sizes, keyed so the hashes do not matter. */
function measure(dist: string): Measurement {
  const chunks: Record<string, number> = {};
  let totalBytes = 0;

  for (const file of walk(dist)) {
    totalBytes += statSync(file).size;
    const name = relative(dist, file).replaceAll('\\', '/');
    if (!/\.(js|css)$/.test(name)) continue;
    chunks[stripHash(name)] = statSync(file).size;
  }

  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const entry = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
  if (!entry) {
    console.error(`${dist}/index.html has no module script to call the entry`);
    process.exit(1);
  }

  return {
    entry: stripHash(entry.replace(/^.*\/assets\//, 'assets/')),
    totalBytes,
    chunks: Object.fromEntries(
      Object.entries(chunks).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

/** `assets/index-CFMeofel.js` to `assets/index.js`. */
function stripHash(name: string) {
  return name.replace(/-[\w-]{8}(?=\.(js|css)$)/, '');
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

/** Fails the run when `now` is over the allowance `kind` grants `was`. */
function compare(
  pkg: string,
  label: string,
  was: number,
  now: number,
  kind: keyof typeof TOLERANCE,
) {
  const { fraction, floor } = TOLERANCE[kind];
  const budget = was + Math.max(Math.round(was * fraction), floor);
  if (now <= budget) return;
  failures.push(
    `${pkg}: ${label} is ${kb(now)}, was ${kb(was)}, budget ${kb(budget)} ` +
      `(+${kb(now - was)}, ${((now / was - 1) * 100).toFixed(1)}%)`,
  );
}

function kb(bytes: number) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}
