import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The portal is a pure Convex client: it talks to the catalog's Convex
// deployment via `convex/react` (typed through the facade in
// src/lib/convexApi.ts) and reads only the clean catalog table. No auth, no
// dev proxy.
export default defineConfig({
  // Nested under the connector portal on the repo's single Pages site
  // (https://qrabbe.github.io/matvis/catalog/), so the CI build sets
  // PORTAL_BASE=/matvis/catalog/. Local dev and a future root host leave it
  // unset then '/'.
  base: process.env.PORTAL_BASE || '/',
  plugins: [react()],
  server: { port: 5373 },
  // `@wordpress/ui` ships a nested `react`/`react-dom`; without deduping, Vite's
  // optimizer can load a second React copy and every hook throws "Invalid hook
  // call". Force one instance across all deps (surfaced after adding DataViews).
  resolve: { dedupe: ['react', 'react-dom'] },
});
