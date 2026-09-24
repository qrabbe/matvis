import type { FunctionReference } from 'convex/server';
import { anyApi } from 'convex/server';

/** Hand-typed the same way `catalogApi.ts` is: `convex/_generated/api` only
 * exists once `bunx convex dev` has run against a real deployment, which is
 * a manual step the person running this app takes themselves (see the
 * README). Typechecking the app can't depend on that having happened. */

export interface ConsumptionEventRow {
  _id: string;
  _creationTime: number;
  ean: string;
  quantity: number;
  consumedAt: number;
}

export interface PreferenceRow {
  ean: string;
  excluded: boolean;
}

type LogConsumption = FunctionReference<
  'mutation',
  'public',
  { token: string; ean: string; quantity: number; consumedAt: number },
  string
>;

type DeleteConsumption = FunctionReference<
  'mutation',
  'public',
  { token: string; eventId: string },
  null
>;

type SetExcluded = FunctionReference<
  'mutation',
  'public',
  { token: string; ean: string; excluded: boolean },
  null
>;

type ListConsumption = FunctionReference<
  'query',
  'public',
  { token: string },
  ConsumptionEventRow[]
>;

type ListPreferences = FunctionReference<
  'query',
  'public',
  { token: string },
  PreferenceRow[]
>;

type ExportAll = FunctionReference<
  'query',
  'public',
  { token: string },
  {
    consumptionEvents: ConsumptionEventRow[];
    productPreferences: PreferenceRow[];
  }
>;

type AppBackendApi = {
  consumption: {
    logConsumption: LogConsumption;
    deleteConsumption: DeleteConsumption;
    setExcluded: SetExcluded;
    listConsumption: ListConsumption;
    listPreferences: ListPreferences;
    exportAll: ExportAll;
  };
};

export const appBackendApi = anyApi as unknown as AppBackendApi;
