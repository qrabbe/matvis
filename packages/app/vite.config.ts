import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The app is a pure Convex client: receipts come from the connector deployment
// and products from the catalog deployment. It never talks to Coop directly, so
// there is no dev proxy here. Linking a store is the connector portal's job.
export default defineConfig({
  // Nested under the landing page on the assembled site, same as the portals,
  // so the site build sets PORTAL_BASE=/app/. Local dev leaves it unset → '/'.
  base: process.env.PORTAL_BASE || '/',
  plugins: [react()],
  server: { port: 5173 },
  // `@wordpress/ui` ships a nested `react`/`react-dom`; without deduping, Vite's
  // optimizer can load a second React copy and every hook throws "Invalid hook
  // call". Force one instance across all deps (same fix as connector-portal).
  resolve: { dedupe: ['react', 'react-dom'] },
});
