import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

// Plain JS and outside `src/` for the same reason as vite.js: Vite loads a
// config file by bundling it and leaves bare imports external, so Node ends up
// loading this file itself and cannot read a `.ts` one. `vitest.d.ts` carries
// the types.

const setupFile = fileURLToPath(new URL('./vitest-setup.js', import.meta.url));

/**
 * The Vitest config every Matvis frontend shares.
 *
 * Component tests use a `.vitest.tsx` suffix, the same convention the connector
 * uses for its convex-test files, so `bun test` at the repo root ignores them
 * and the two runners never fight over one file. The bun suites keep the pure
 * logic; anything that needs a DOM lands here.
 * @param {{ test?: import('vitest/config').UserConfig['test'] }} [options]
 * @returns {import('vitest/config').UserConfig}
 */
export function matvisTest({ test } = {}) {
  return {
    plugins: [react()],
    // Same reason as the build config: a component rendered against a second
    // copy of React throws "Invalid hook call" on its first hook.
    resolve: { dedupe: ['react', 'react-dom'] },
    test: {
      environment: 'jsdom',
      include: ['test/**/*.vitest.{ts,tsx}'],
      setupFiles: [setupFile],
      ...test,
    },
  };
}
