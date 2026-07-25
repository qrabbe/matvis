/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as backfill from "../backfill.js";
import type * as catalog from "../catalog.js";
import type * as coop_discovery from "../coop/discovery.js";
import type * as coop_fetch from "../coop/fetch.js";
import type * as coop_sanitize from "../coop/sanitize.js";
import type * as crons from "../crons.js";
import type * as ingest from "../ingest.js";
import type * as model_counters from "../model/counters.js";
import type * as model_fields from "../model/fields.js";
import type * as model_ingest from "../model/ingest.js";
import type * as model_project from "../model/project.js";
import type * as raw from "../raw.js";
import type * as schemes_coop from "../schemes/coop.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  backfill: typeof backfill;
  catalog: typeof catalog;
  "coop/discovery": typeof coop_discovery;
  "coop/fetch": typeof coop_fetch;
  "coop/sanitize": typeof coop_sanitize;
  crons: typeof crons;
  ingest: typeof ingest;
  "model/counters": typeof model_counters;
  "model/fields": typeof model_fields;
  "model/ingest": typeof model_ingest;
  "model/project": typeof model_project;
  raw: typeof raw;
  "schemes/coop": typeof schemes_coop;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
