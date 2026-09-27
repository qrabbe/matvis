import { defineConfig } from 'vitest/config';

// One `vitest run` for the whole repo. Packages are listed rather than
// globbed so a package without a vitest config isn't picked up as an empty
// project that fails for having no test files. Pure-logic suites stay on bun
// test, per the root `test` script.
export default defineConfig( {
	test: {
		projects: [
			'packages/connector',
			'packages/catalog',
			'packages/app',
			'packages/connector-portal',
			'packages/catalog-portal',
			'packages/landing',
		],
	},
} );
