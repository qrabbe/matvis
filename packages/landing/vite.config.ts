import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The landing page has no backend: it is a static React build on @matvis/ui,
// so it reads as the same product as the portals it links to.
export default defineConfig({
  // Served at the root of the repo's single Pages site
  // (https://qrabbe.github.io/matvis/), so the CI build sets PORTAL_BASE=/matvis/.
  // Local dev and a future root host leave it unset then '/'.
  base: process.env.PORTAL_BASE || '/',
  plugins: [react()],
  server: { port: 5473 },
  // `@wordpress/ui` ships a nested `react`/`react-dom`; without deduping, Vite's
  // optimizer can load a second React copy and every hook throws "Invalid hook
  // call". Same guard as the portals.
  resolve: { dedupe: ['react', 'react-dom'] },
});
