import { defineConfig } from 'vite';
import { matvisApp } from '@matvis/ui/vite';

// The app is a pure Convex client: receipts come from the connector deployment
// and products from the catalog deployment. It never talks to Coop directly, so
// there is no dev proxy here. Linking a store is the connector portal's job.
export default defineConfig(matvisApp({ port: 5173 }));
