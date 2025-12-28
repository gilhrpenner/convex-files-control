import { afterEach, describe, expect, test, vi } from "vitest";

const retrierMocks = vi.hoisted(() => {
  return {
    run: vi.fn(async () => "run-id"),
  };
});

vi.mock("@convex-dev/action-retrier", () => {
  class ActionRetrier {
    run = retrierMocks.run;
  }
  return { ActionRetrier };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cleanUp retrier path", () => {
  test("deleteFileCascade uses action retrier when env flags are unset", async () => {
    const savedVitest = process.env.VITEST;
    const savedNodeEnv = process.env.NODE_ENV;
    process.env.VITEST = "";
    process.env.NODE_ENV = "production";
    vi.resetModules();

    const { deleteFileCascade } = await import("../component/cleanUp.js");

    const ctx = {
      db: {
        query: (_table: string) => ({
          withIndex: () => ({
            first: async () => ({
              _id: "file-id",
              storageId: "storage",
              storageProvider: "convex",
            }),
            collect: async () => [],
          }),
        }),
        delete: vi.fn(async () => undefined),
      },
      storage: {
        delete: vi.fn(async () => undefined),
      },
    } as any;

    await deleteFileCascade(ctx, "storage");
    expect(retrierMocks.run).toHaveBeenCalled();

    process.env.VITEST = savedVitest;
    process.env.NODE_ENV = savedNodeEnv;
  });
});
