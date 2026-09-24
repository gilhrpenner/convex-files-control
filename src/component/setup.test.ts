/// <reference types="vite/client" />
import { test } from "vitest";
import schema from "./schema.js";
import { convexTest } from "convex-test";
import actionRetrier from "@convex-dev/action-retrier/test";
import testHelpers from "../test.js";

export const modules = testHelpers.modules;

export function initConvexTest() {
  const t = convexTest(schema, modules);
  actionRetrier.register(t);
  return t;
}

test("setup", () => {});
