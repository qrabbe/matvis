import { defineConfig } from 'vitest/config';

// Convex query tests run under convex-test, which needs the edge runtime and
// Vite-only features (import.meta.glob). They use a `.vitest.ts` suffix so
// Bun's test runner ignores them — bare `bun test` at the repo root would
// otherwise pick them up and fail. The bun:test suite in `test/` runs
// separately (see `test` script + packages/connect/bunfig.toml).
export default defineConfig({
  test: {
    environment: 'edge-runtime',
    include: ['convex/**/*.vitest.ts'],
    // The read API resolves callers through the dev-subject fallback, so the
    // seam must allow it under test (production leaves this unset).
    env: { ALLOW_DEV_SUBJECT: 'true' },
    server: { deps: { inline: ['convex-test'] } },
  },
});
