/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accessToken from "../accessToken.js";
import type * as auth from "../auth.js";
import type * as connections from "../connections.js";
import type * as http from "../http.js";
import type * as links from "../links.js";
import type * as matching from "../matching.js";
import type * as model_accounts from "../model/accounts.js";
import type * as model_auth from "../model/auth.js";
import type * as model_receipts from "../model/receipts.js";
import type * as receipts from "../receipts.js";
import type * as sync from "../sync.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accessToken: typeof accessToken;
  auth: typeof auth;
  connections: typeof connections;
  http: typeof http;
  links: typeof links;
  matching: typeof matching;
  "model/accounts": typeof model_accounts;
  "model/auth": typeof model_auth;
  "model/receipts": typeof model_receipts;
  receipts: typeof receipts;
  sync: typeof sync;
  validators: typeof validators;
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
