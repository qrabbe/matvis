import { defineConfig } from 'vitest/config';

// Convex query tests run under convex-test, which needs the edge runtime and
// Vite-only features (import.meta.glob). They use a `.vitest.ts` suffix so
// Bun's test runner ignores them — the root `test` script is a bare `bun test`
// and would otherwise pick them up and fail. The bun:test suite in `test/` runs
// separately (see `test` script + packages/connector/bunfig.toml).
export default defineConfig({
  test: {
    environment: 'edge-runtime',
    include: ['convex/**/*.vitest.ts'],
    server: { deps: { inline: ['convex-test'] } },
  },
});
