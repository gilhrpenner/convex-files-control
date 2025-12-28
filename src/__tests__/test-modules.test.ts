import { describe, expect, test, vi } from "vitest";

vi.mock("convex/server", async () => {
  const actual = await vi.importActual<typeof import("convex/server")>(
    "convex/server",
  );
  return {
    ...actual,
    defineComponent: () => ({ use: vi.fn() }),
  };
});

vi.mock("@convex-dev/action-retrier/convex.config", () => ({
  default: { name: "actionRetrier" },
}));

import testHelpers from "../test.js";

const moduleLoaders = Object.values(testHelpers.modules);
await Promise.all(moduleLoaders.map((load) => load()));

describe("test helpers modules", () => {
  test("loads component modules from import.meta.glob", () => {
    expect(moduleLoaders.length).toBeGreaterThan(0);
  });
});
