import { describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  use: vi.fn(),
  actionRetrier: { name: "actionRetrier" },
}));

vi.mock("convex/server", () => {
  return {
    defineComponent: (name: string) => ({
      name,
      use: mocks.use,
    }),
  };
});

vi.mock("@convex-dev/action-retrier/convex.config", () => {
  return {
    default: mocks.actionRetrier,
  };
});

describe("convex.config", () => {
  test("registers action retrier on component", async () => {
    vi.resetModules();
    const config = await import("../component/convex.config.js");
    expect(config.default).toBeDefined();
    expect(mocks.use).toHaveBeenCalledWith(mocks.actionRetrier);
  });
});
