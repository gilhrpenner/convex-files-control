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

describe("transfer retrier path", () => {
  test("commitTransfer uses action retrier when env flags are unset", async () => {
    const savedVitest = process.env.VITEST;
    const savedNodeEnv = process.env.NODE_ENV;
    process.env.VITEST = "";
    process.env.NODE_ENV = "production";
    vi.resetModules();

    const { commitTransfer } = await import("../component/transfer.js");
    const handler = (commitTransfer as any)._handler;

    const ctx = {
      db: {
        query: (table: string) => ({
          withIndex: () => ({
            first: async () => ({
              _id: "file",
              storageId: "storage",
              storageProvider: "convex",
            }),
            collect: async () =>
              table === "fileAccess"
                ? [{ _id: "access" }]
                : table === "downloadGrants"
                  ? [{ _id: "grant" }]
                  : [],
          }),
        }),
        patch: vi.fn(async () => undefined),
      },
      storage: {
        delete: vi.fn(async () => undefined),
      },
    } as any;

    await handler(ctx, {
      storageId: "storage",
      newStorageId: "new",
      targetProvider: "r2",
      sourceProvider: "convex",
    });

    expect(retrierMocks.run).toHaveBeenCalled();

    process.env.VITEST = savedVitest;
    process.env.NODE_ENV = savedNodeEnv;
  });
});
