import { defineConfig } from 'vite';
import { matvisApp } from '@matvis/ui/vite';

// The landing page has no backend: it is a static React build on @matvis/ui,
// so it reads as the same product as the portals it links to.
export default defineConfig(matvisApp({ port: 5473 }));
