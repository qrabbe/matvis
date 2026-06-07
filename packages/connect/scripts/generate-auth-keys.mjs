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

const prod = process.argv.includes('--prod');
const envFlags = prod ? ['--prod'] : [];

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pkcs8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const jwk = publicKey.export({ format: 'jwk' });
const jwks = JSON.stringify({ keys: [{ use: 'sig', alg: 'RS256', ...jwk }] });

function setEnv(name, value) {
  // execFileSync with an args array — no shell, so the multi-line PEM is passed
  // intact without quoting hazards.
  execFileSync('npx', ['convex', 'env', 'set', ...envFlags, name, value], {
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: process.platform === 'win32', // npx resolves via .cmd on Windows
  });
}

const target = prod ? 'PRODUCTION' : 'the current (dev)';
console.log(`Setting JWT_PRIVATE_KEY + JWKS on ${target} deployment…`);
setEnv('JWT_PRIVATE_KEY', pkcs8);
setEnv('JWKS', jwks);
console.log('Done. (Private key was piped, not printed.)');
