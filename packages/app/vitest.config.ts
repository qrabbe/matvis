import { defineConfig } from 'vitest/config';
import { matvisTest } from '@matvis/ui/vitest';

// Component and hook tests. The pure logic in `src/lib` stays on bun test in
// `test/lib` — it needs no DOM, and bun runs it in a fraction of the time.
export default defineConfig(matvisTest());
