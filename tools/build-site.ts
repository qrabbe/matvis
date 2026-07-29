/**
 * Assembles the whole public site into `_site/`: the landing page at the root,
 * each portal under its own sub-path. Used by the statichost.eu build (see
 * statichost.yml) and runnable locally to preview the deployed layout.
 *
 * Every frontend is a separate Vite build, so each one needs its own base path
 * and, for the portals and the app, its own Convex deployment URL. Each build
 * reads its deployments under fixed `VITE_*` names, and several point at
 * different deployments under the same name, so the URLs come in here under
 * distinct names and are mapped onto the right target var per build.
 *
 *   SITE_BASE               path the site is served from, default '/'
 *   CONNECTOR_CONVEX_URL    connector deployment, read by the connector portal
 *                           and by the app
 *   CATALOG_CONVEX_URL      catalog deployment, read by the catalog portal and
 *                           by the app
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const SITE_BASE = withSlashes(process.env.SITE_BASE || '/');

type Build = {
  pkg: string;
  /** Sub-path under SITE_BASE, empty for the site root. */
  path: string;
  /** Convex URLs this build needs, as target env var → source env var. */
  convexUrlVars?: Record<string, string>;
};

const BUILDS: Build[] = [
  { pkg: '@matvis/landing', path: '' },
  {
    pkg: '@matvis/connector-portal',
    path: 'connector',
    convexUrlVars: { VITE_CONVEX_URL: 'CONNECTOR_CONVEX_URL' },
  },
  {
    pkg: '@matvis/catalog-portal',
    path: 'catalog',
    convexUrlVars: { VITE_CONVEX_URL: 'CATALOG_CONVEX_URL' },
  },
  {
    pkg: '@matvis/app',
    path: 'app',
    convexUrlVars: {
      VITE_CONVEX_URL: 'CONNECTOR_CONVEX_URL',
      VITE_CATALOG_CONVEX_URL: 'CATALOG_CONVEX_URL',
    },
  },
];

const sourceVars = [
  ...new Set(
    BUILDS.flatMap((build) => Object.values(build.convexUrlVars ?? {})),
  ),
];

const missing = sourceVars.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(
    `Missing required env var(s): ${missing.join(', ')}.\n` +
      'Set them in the statichost.eu site settings, or export them locally to ' +
      'build a portal against a deployment you can reach.',
  );
  process.exit(1);
}

// Whatever these hold is baked into a public JS bundle, so a wrong value is not
// just a broken page. A deploy key pasted here would be published as plain text
// and hand anyone admin rights on the deployment, so refuse anything that is
// not a plain https deployment URL.
const invalid = sourceVars.filter(
  (name) => !/^https:\/\/[^\s|]+$/.test(process.env[name] as string),
);
if (invalid.length > 0) {
  for (const name of invalid) {
    const value = process.env[name] as string;
    const looksLikeKey = value.includes('|') || /^(dev|prod):/.test(value);
    console.error(
      `${name} is not a deployment URL` +
        (looksLikeKey ? ' (that looks like a Convex deploy key)' : '') +
        `.\nExpected something like https://your-deployment-123.convex.cloud`,
    );
  }
  process.exit(1);
}

rmSync('_site', { recursive: true, force: true });
mkdirSync('_site', { recursive: true });

for (const build of BUILDS) {
  const base = withSlashes(`${SITE_BASE}${build.path}`);
  console.log(`building ${build.pkg} at ${base}`);

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PORTAL_BASE: base,
  };
  for (const [target, source] of Object.entries(build.convexUrlVars ?? {})) {
    env[target] = process.env[source] as string;
  }

  const result = Bun.spawnSync(['bun', 'run', '--filter', build.pkg, 'build'], {
    env,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (result.exitCode !== 0) {
    console.error(`${build.pkg} build failed`);
    process.exit(result.exitCode ?? 1);
  }

  const dist = `packages/${build.pkg.replace('@matvis/', '')}/dist`;
  const target = build.path ? `_site/${build.path}` : '_site';
  mkdirSync(target, { recursive: true });
  cpSync(dist, target, { recursive: true });
}

console.log('assembled _site');

/** Normalizes a base path to the leading and trailing slashes Vite expects. */
function withSlashes(path: string) {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}
