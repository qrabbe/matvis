import type { FunctionReference } from 'convex/server';
import { anyApi } from 'convex/server';

/** Hand-typed the same way `catalogApi.ts` is: `convex/_generated/api` only
 * exists once `bunx convex dev` has run against a real deployment, which is
 * a manual step the person running this app takes themselves (see the
 * README). Typechecking the app can't depend on that having happened. */

export type MarkOutcome = 'finished' | 'wasted';
export type MarkVia = 'tap' | 'trip' | 'details';

export interface UnitKey {
  receiptId: string;
  lineNo: number;
  unitIndex: number;
}

export interface MarkRow extends UnitKey {
  _id: string;
  _creationTime: number;
  outcome: MarkOutcome;
  finishedAt: number;
  finishedAtHandSet: boolean;
  startedAt?: number;
  via: MarkVia;
}

type Mark = FunctionReference<
  'mutation',
  'public',
  {
    token: string;
    receiptId: string;
    lineNo: number;
    unitIndex: number;
    outcome: MarkOutcome;
    finishedAt: number;
    finishedAtHandSet: boolean;
    startedAt?: number;
    via: MarkVia;
  },
  string
>;

type MarkMany = FunctionReference<
  'mutation',
  'public',
  {
    token: string;
    units: UnitKey[];
    outcome: MarkOutcome;
    finishedAt: number;
    finishedAtHandSet: boolean;
    via: MarkVia;
  },
  string[]
>;

type Unmark = FunctionReference<
  'mutation',
  'public',
  { token: string; receiptId: string; lineNo: number; unitIndex: number },
  null
>;

type ListMarks = FunctionReference<
  'query',
  'public',
  { token: string },
  MarkRow[]
>;

type ExportAll = FunctionReference<
  'query',
  'public',
  { token: string },
  { marks: MarkRow[] }
>;

type AppBackendApi = {
  marks: {
    mark: Mark;
    markMany: MarkMany;
    unmark: Unmark;
    list: ListMarks;
    exportAll: ExportAll;
  };
};

export const appBackendApi = anyApi as unknown as AppBackendApi;
