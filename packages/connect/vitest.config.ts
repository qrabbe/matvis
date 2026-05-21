import { defineConfig } from 'vitest/config';

// Convex query tests run under convex-test, which needs the edge runtime.
// Scoped to convex/*.test.ts so it doesn't collide with the bun:test suite in
// `test/` (run separately via `bun test`).
export default defineConfig({
  test: {
    environment: 'edge-runtime',
    include: ['convex/**/*.test.ts'],
    // The read API resolves callers through the dev-subject fallback, so the
    // seam must allow it under test (production leaves this unset).
    env: { ALLOW_DEV_SUBJECT: 'true' },
    server: { deps: { inline: ['convex-test'] } },
  },
});
