import type { UserConfig } from 'vite';

/** The Vite config every Matvis frontend shares. Only the dev port varies. */
export declare function matvisApp(options: { port: number }): UserConfig;
