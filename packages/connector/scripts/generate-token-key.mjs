// Mint the AES-256-GCM key that encrypts store tokens at rest and set it on a
// deployment as TOKEN_ENC_KEY (base64, 32 bytes). The key is piped straight into
// `convex env set` and never printed.
//
// Usage (from packages/connector):
//   node scripts/generate-token-key.mjs          # current (dev) deployment
//   node scripts/generate-token-key.mjs --prod   # production deployment
//
// Re-running rotates the key, which makes every already-stored connection
// undecryptable. Those links have to be re-established through BankID.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const prod = process.argv.includes('--prod');
const envFlags = prod ? ['--prod'] : [];

// Same CLI resolution as generate-auth-keys.mjs: run the Convex CLI's JS entry
// with `node` directly so no shell touches the argument values.
const here = dirname(fileURLToPath(import.meta.url));
const convexCli = [
  join(here, '..', 'node_modules', 'convex', 'bin', 'main.js'),
  join(here, '..', '..', '..', 'node_modules', 'convex', 'bin', 'main.js'),
].find(existsSync);
if (!convexCli)
  throw new Error('Could not locate the Convex CLI (convex/bin/main.js)');

const key = randomBytes(32).toString('base64');

const target = prod ? 'PRODUCTION' : 'the current (dev)';
console.log(`Setting TOKEN_ENC_KEY on ${target} deployment…`);
execFileSync(
  process.execPath,
  [convexCli, 'env', 'set', ...envFlags, `TOKEN_ENC_KEY=${key}`],
  { stdio: ['ignore', 'inherit', 'inherit'] },
);
console.log('Done. (Key was piped, not printed.)');
