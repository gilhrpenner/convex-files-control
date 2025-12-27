/// <reference types="vite/client" />
import type { TestConvex } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import schema from "./component/schema.js";
import actionRetrier from "@convex-dev/action-retrier/test";

const modules = import.meta.glob("./component/**/*.ts");

/**
 * Register this component in a Convex test instance.
 *
 * @param t - The Convex test instance from `convexTest`.
 * @param name - The component name from your `convex.config.ts`.
 *
 * @example
 * ```ts
 * import { convexTest } from "convex-test";
 * import { register } from "@gilhrpenner/convex-files-control/test";
 *
 * const t = convexTest(schema, modules);
 * register(t, "convexFilesControl");
 * ```
 */
export function register(
  t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
  name: string = "convexFilesControl",
) {
  t.registerComponent(name, schema, modules);
  actionRetrier.register(t);
}

export default { register, schema, modules };
