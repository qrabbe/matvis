/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as backfill from "../backfill.js";
import type * as catalog from "../catalog.js";
import type * as coop_fetch from "../coop/fetch.js";
import type * as coop_sanitize from "../coop/sanitize.js";
import type * as crons from "../crons.js";
import type * as ingest from "../ingest.js";
import type * as model_admin from "../model/admin.js";
import type * as model_counters from "../model/counters.js";
import type * as model_fields from "../model/fields.js";
import type * as model_ingest from "../model/ingest.js";
import type * as model_ops from "../model/ops.js";
import type * as model_project from "../model/project.js";
import type * as model_runs from "../model/runs.js";
import type * as model_search from "../model/search.js";
import type * as ops from "../ops.js";
import type * as products from "../products.js";
import type * as schemes_coop from "../schemes/coop.js";
import type * as search from "../search.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  backfill: typeof backfill;
  catalog: typeof catalog;
  "coop/fetch": typeof coop_fetch;
  "coop/sanitize": typeof coop_sanitize;
  crons: typeof crons;
  ingest: typeof ingest;
  "model/admin": typeof model_admin;
  "model/counters": typeof model_counters;
  "model/fields": typeof model_fields;
  "model/ingest": typeof model_ingest;
  "model/ops": typeof model_ops;
  "model/project": typeof model_project;
  "model/runs": typeof model_runs;
  "model/search": typeof model_search;
  ops: typeof ops;
  products: typeof products;
  "schemes/coop": typeof schemes_coop;
  search: typeof search;
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
