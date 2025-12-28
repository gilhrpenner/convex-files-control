/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accessControl from "../accessControl.js";
import type * as cleanUp from "../cleanUp.js";
import type * as constants from "../constants.js";
import type * as download from "../download.js";
import type * as lib from "../lib.js";
import type * as queries from "../queries.js";
import type * as r2 from "../r2.js";
import type * as storageProvider from "../storageProvider.js";
import type * as transfer from "../transfer.js";
import type * as upload from "../upload.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  accessControl: typeof accessControl;
  cleanUp: typeof cleanUp;
  constants: typeof constants;
  download: typeof download;
  lib: typeof lib;
  queries: typeof queries;
  r2: typeof r2;
  storageProvider: typeof storageProvider;
  transfer: typeof transfer;
  upload: typeof upload;
  validators: typeof validators;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {
  actionRetrier: import("@convex-dev/action-retrier/_generated/component.js").ComponentApi<"actionRetrier">;
};
