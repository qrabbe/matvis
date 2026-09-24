import { defineConfig } from 'vitest/config';
import { matvisTest } from '@matvis/ui/vitest';

// Component/hook tests (jsdom) plus this package's own Convex backend tests
// (edge runtime, `convex-test`) in one project — app is now both a frontend
// and its own small backend, the same split `connector`/`catalog` draw with
// their `.vitest.ts` suffix, just inside one package instead of two.
// `environmentMatchGlobs` gives the `convex/` files their own environment
// without moving the pure `src/lib` logic off `bun test` in `test/lib`.
const base = matvisTest();

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['test/**/*.vitest.{ts,tsx}', 'convex/**/*.vitest.ts'],
    environmentMatchGlobs: [['convex/**', 'edge-runtime']],
    server: { deps: { inline: ['convex-test'] } },
  },
});
