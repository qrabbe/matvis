import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The portal is a pure Convex client: it talks to the connector's Convex
// deployment via `convex/react` (typed through the facade in
// src/lib/convexApi.ts) and never touches Coop directly, so there is no dev
// proxy here (unlike @matvis/app).
export default defineConfig({
  // Nested under the landing page on the repo's single Pages site
  // (https://qrabbe.github.io/matvis/connector/), so the CI build sets
  // PORTAL_BASE=/matvis/connector/. Local dev and a future root host (e.g.
  // Vercel + custom domain) leave it unset → '/'.
  base: process.env.PORTAL_BASE || '/',
  plugins: [react()],
  server: { port: 5273 },
  // `@wordpress/ui` ships a nested `react`/`react-dom`; without deduping, Vite's
  // optimizer can load a second React copy and every hook throws "Invalid hook
  // call". Force one instance across all deps (surfaced after adding DataViews).
  resolve: { dedupe: ['react', 'react-dom'] },
});
