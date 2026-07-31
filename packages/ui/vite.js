import react from '@vitejs/plugin-react';

// Plain JS, not TS, and outside `src/` on purpose: Vite loads a config file by
// bundling it and leaves bare imports external, so Node ends up loading this
// file itself and cannot read a `.ts` one. `vite.d.ts` carries the types.

/**
 * The Vite config every Matvis frontend shares. Only the dev port varies.
 * @param {{ port: number }} options
 * @returns {import('vite').UserConfig}
 */
export function matvisApp({ port }) {
  return {
    // The site build nests each frontend under the landing page and sets
    // PORTAL_BASE. Local dev and a future root host leave it unset then '/'.
    base: process.env.PORTAL_BASE || '/',
    plugins: [react()],
    server: { port },
    // `@wordpress/ui` ships a nested `react`/`react-dom`; without deduping,
    // Vite's optimizer can load a second React copy and every hook throws
    // "Invalid hook call". Force one instance across all deps.
    resolve: { dedupe: ['react', 'react-dom'] },
  };
}
