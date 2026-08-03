import type { UserConfig } from 'vitest/config';

/** The Vitest config every Matvis frontend shares. */
export declare function matvisTest(options?: {
  test?: UserConfig['test'];
}): UserConfig;
