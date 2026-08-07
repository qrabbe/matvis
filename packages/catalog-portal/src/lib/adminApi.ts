import type { FunctionReturnType } from 'convex/server';
import { api } from '@matvis/catalog/api';

/** The generated API, not a hand-written mirror of it. Every shape below is
 * read back off the real function, so a rename in the backend breaks the build
 * here instead of at runtime. */
export const adminApi = api;

type Signed<T> = NonNullable<T>;

export type Overview = Signed<FunctionReturnType<typeof api.admin.overview>>;
export type QueueStatus = Overview extends { queue: infer Q }
  ? keyof Q & string
  : never;

type QueuePage = Signed<FunctionReturnType<typeof api.admin.queueRows>>;
export type QueueRow = QueuePage['rows'][number];

export type RunRow = Signed<FunctionReturnType<typeof api.admin.runs>>[number];
