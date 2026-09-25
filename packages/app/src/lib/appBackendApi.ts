import type { FunctionReference } from 'convex/server';
import { anyApi } from 'convex/server';

/** Hand-typed the same way `catalogApi.ts` is: `convex/_generated/api` only
 * exists once `bunx convex dev` has run against a real deployment, which is
 * a manual step the person running this app takes themselves (see the
 * README). Typechecking the app can't depend on that having happened. */

export type MarkOutcome = 'finished' | 'wasted';
export type MarkVia = 'tap' | 'trip' | 'details' | 'backfill';
export type MarkSource = 'user' | 'backfill';

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
  /** Absent means `'user'` — only the one-time backfill script ever sets
   * `'backfill'`. See the `marks` table's doc comment in `convex/schema.ts`. */
  source?: MarkSource;
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
    source?: MarkSource;
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
    source?: MarkSource;
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

export interface DurationEstimateRow {
  _id: string;
  _creationTime: number;
  groupKey: string;
  label: string;
  daysToFinish: number;
  daysOnceOpened?: number;
  maxDaysFromPurchase?: number;
  singleUse?: boolean;
  source: string;
}

type ListDurationEstimates = FunctionReference<
  'query',
  'public',
  Record<string, never>,
  DurationEstimateRow[]
>;

export interface TargetsValue {
  energy?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
  fiber?: number | null;
  saturatedFat?: number | null;
  salt?: number | null;
}

type GetSettings = FunctionReference<
  'query',
  'public',
  { token: string },
  { targets: TargetsValue }
>;

type SetTargets = FunctionReference<
  'mutation',
  'public',
  { token: string; targets: TargetsValue },
  null
>;

type AppBackendApi = {
  marks: {
    mark: Mark;
    markMany: MarkMany;
    unmark: Unmark;
    list: ListMarks;
    exportAll: ExportAll;
  };
  durationEstimates: {
    list: ListDurationEstimates;
  };
  settings: {
    get: GetSettings;
    setTargets: SetTargets;
  };
};

export const appBackendApi = anyApi as unknown as AppBackendApi;
