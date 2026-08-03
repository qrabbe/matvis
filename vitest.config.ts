import { defineConfig } from 'vitest/config';

/**
 * One `vitest run` for the whole repo.
 *
 * Each package keeps its own config, because they do not agree on an
 * environment: the connector's convex-test files need the edge runtime, and the
 * four frontends need a DOM. Listing the projects rather than globbing
 * `packages/*` keeps a package without a vitest config from being picked up as
 * an empty project that then fails for having no test files.
 *
 * The pure-logic suites stay on bun test — see the root `test` script.
 */
export default defineConfig({
  test: {
    projects: [
      'packages/connector',
      'packages/app',
      'packages/connector-portal',
      'packages/catalog-portal',
      'packages/landing',
    ],
  },
});
