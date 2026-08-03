import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Testing Library only auto-registers its unmount hook when Vitest's globals
// are on, and they are not. Doing it here keeps every suite explicit-import
// while still guaranteeing one tree per test.
afterEach(cleanup);

// jsdom implements neither, and both are reached the moment a chart or a
// scrollable list renders. Recharts in particular measures its container on
// mount, so without this the first render throws rather than drawing nothing.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.Element.prototype.scrollIntoView ??= function scrollIntoView() {};
