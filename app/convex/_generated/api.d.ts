/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents_director from "../agents/director.js";
import type * as agents_mapper from "../agents/mapper.js";
import type * as agents_scout from "../agents/scout.js";
import type * as http from "../http.js";
import type * as lib_aiRetry from "../lib/aiRetry.js";
import type * as lib_cors from "../lib/cors.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_events from "../lib/events.js";
import type * as lib_validators from "../lib/validators.js";
import type * as prompts_director from "../prompts/director.js";
import type * as prompts_scout from "../prompts/scout.js";
import type * as runs from "../runs.js";
import type * as seed from "../seed.js";
import type * as sessions from "../sessions.js";
import type * as sitePages from "../sitePages.js";
import type * as storyboards from "../storyboards.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agents/director": typeof agents_director;
  "agents/mapper": typeof agents_mapper;
  "agents/scout": typeof agents_scout;
  http: typeof http;
  "lib/aiRetry": typeof lib_aiRetry;
  "lib/cors": typeof lib_cors;
  "lib/crypto": typeof lib_crypto;
  "lib/errors": typeof lib_errors;
  "lib/events": typeof lib_events;
  "lib/validators": typeof lib_validators;
  "prompts/director": typeof prompts_director;
  "prompts/scout": typeof prompts_scout;
  runs: typeof runs;
  seed: typeof seed;
  sessions: typeof sessions;
  sitePages: typeof sitePages;
  storyboards: typeof storyboards;
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
