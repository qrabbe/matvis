import { defineConfig } from 'vite';
import { matvisApp } from '@matvis/ui/vite';

// The portal is a pure Convex client: it talks to the catalog's Convex
// deployment via `convex/react` (typed through the facade in
// src/lib/convexApi.ts) and reads only the clean catalog table. No auth, no
// dev proxy.
export default defineConfig(matvisApp({ port: 5373 }));
