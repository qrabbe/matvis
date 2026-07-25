/**
 * Assembles the whole public site into `_site/`: the landing page at the root,
 * each portal under its own sub-path. Used by the statichost.eu build (see
 * statichost.yml) and runnable locally to preview the deployed layout.
 *
 * Every frontend is a separate Vite build, so each one needs its own base path
 * and, for the portals, its own Convex deployment URL. The two portals both
 * read `VITE_CONVEX_URL` but point at different deployments, so the URLs come
 * in under distinct names and are handed to the right child build here.
 *
 *   SITE_BASE               path the site is served from, default '/'
 *   CONNECTOR_CONVEX_URL    connector deployment the connector portal talks to
 *   CATALOG_CONVEX_URL      catalog deployment the catalog portal talks to
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const SITE_BASE = withSlashes(process.env.SITE_BASE || '/');

type Build = {
  pkg: string;
  /** Sub-path under SITE_BASE, empty for the site root. */
  path: string;
  /** Name of the env var holding this build's Convex URL, if it needs one. */
  convexUrlVar?: string;
};

const BUILDS: Build[] = [
  { pkg: '@matvis/landing', path: '' },
  {
    pkg: '@matvis/connector-portal',
    path: 'connector',
    convexUrlVar: 'CONNECTOR_CONVEX_URL',
  },
  {
    pkg: '@matvis/catalog-portal',
    path: 'catalog',
    convexUrlVar: 'CATALOG_CONVEX_URL',
  },
];

const missing = BUILDS.filter(
  (build) => build.convexUrlVar && !process.env[build.convexUrlVar],
).map((build) => build.convexUrlVar);
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
const invalid = BUILDS.filter((build) => {
  if (!build.convexUrlVar) return false;
  const value = process.env[build.convexUrlVar] as string;
  return !/^https:\/\/[^\s|]+$/.test(value);
});
if (invalid.length > 0) {
  for (const build of invalid) {
    const value = process.env[build.convexUrlVar as string] as string;
    const looksLikeKey = value.includes('|') || /^(dev|prod):/.test(value);
    console.error(
      `${build.convexUrlVar} is not a deployment URL` +
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
  if (build.convexUrlVar) {
    env.VITE_CONVEX_URL = process.env[build.convexUrlVar] as string;
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
