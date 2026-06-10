// Generate the RS256 keypair Convex Auth signs/verifies JWTs with, and set it on
// a deployment as JWT_PRIVATE_KEY (PKCS8 PEM) + JWKS (public JWK Set). The
// private key is piped straight into `convex env set` and never printed.
//
// Usage (from packages/connect):
//   node scripts/generate-auth-keys.mjs          # current (dev) deployment
//   node scripts/generate-auth-keys.mjs --prod   # production deployment
//
// Re-running rotates the keys (invalidates existing sessions). Convex Auth reads
// JWT_PRIVATE_KEY via jose.importPKCS8 with RS256 and real newlines — exactly
// what this emits.
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const prod = process.argv.includes('--prod');
const envFlags = prod ? ['--prod'] : [];

// Locate the Convex CLI's JS entry so we can run it with `node` directly — no
// shell. Passing a multi-line PEM through a shell (npx/bunx on Windows) mangles
// the newlines; an args array to execFileSync preserves them exactly. Its
// package `exports` block a bare require.resolve, so resolve by path — checking
// the package's own node_modules first, then the hoisted workspace root.
const here = dirname(fileURLToPath(import.meta.url));
const convexCli = [
  join(here, '..', 'node_modules', 'convex', 'bin', 'main.js'),
  join(here, '..', '..', '..', 'node_modules', 'convex', 'bin', 'main.js'),
].find(existsSync);
if (!convexCli)
  throw new Error('Could not locate the Convex CLI (convex/bin/main.js)');

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pkcs8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const jwk = publicKey.export({ format: 'jwk' });
const jwks = JSON.stringify({ keys: [{ use: 'sig', alg: 'RS256', ...jwk }] });

function setEnv(name, value) {
  // No shell → the multi-line PEM is one argv entry, intact. Use the `NAME=value`
  // form: the PEM starts with `-----`, which the CLI's option parser would
  // otherwise mistake for a flag; `NAME=` puts a letter first so it's positional.
  execFileSync(
    process.execPath,
    [convexCli, 'env', 'set', ...envFlags, `${name}=${value}`],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
}

const target = prod ? 'PRODUCTION' : 'the current (dev)';
console.log(`Setting JWT_PRIVATE_KEY + JWKS on ${target} deployment…`);
setEnv('JWT_PRIVATE_KEY', pkcs8);
setEnv('JWKS', jwks);
console.log('Done. (Private key was piped, not printed.)');
