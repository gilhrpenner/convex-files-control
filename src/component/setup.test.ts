/// <reference types="vite/client" />
import { test } from "vitest";
import schema from "./schema.js";
import { convexTest } from "convex-test";
import actionRetrier from "@convex-dev/action-retrier/test";

export const modules = import.meta.glob("./**/*.*s");

export function initConvexTest() {
  const t = convexTest(schema, modules);
  actionRetrier.register(t);
  return t;
}

test("setup", () => {});
