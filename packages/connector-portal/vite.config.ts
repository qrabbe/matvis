import { defineConfig } from 'vite';
import { matvisApp } from '@matvis/ui/vite';

// The portal is a pure Convex client: it talks to the connector's Convex
// deployment via `convex/react` (typed through the facade in
// src/lib/convexApi.ts) and never touches Coop directly, so there is no dev
// proxy here (unlike @matvis/app).
export default defineConfig(matvisApp({ port: 5273 }));
