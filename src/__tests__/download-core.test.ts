import { beforeEach, describe, expect, test, vi } from "vitest";

const findFileByStorageIdMock = vi.fn();

vi.mock("../component/lib.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../component/lib.js")>();
  return {
    ...actual,
    findFileByStorageId: findFileByStorageIdMock,
  };
});

function getHandler(fn: unknown) {
  return (fn as { _handler: (...args: any[]) => any })._handler;
}

function makeCtx(grantOverrides: Record<string, unknown> = {}) {
  return {
    db: {
      get: vi.fn(async () => ({
        _id: "grant",
        storageId: "storage",
        maxUses: null,
        useCount: 0,
        shareableLink: true,
        ...grantOverrides,
      })),
      delete: vi.fn(async () => undefined),
    },
  } as any;
}

describe("consumeDownloadGrantForUrl shareable link edge cases", () => {
  beforeEach(() => {
    findFileByStorageIdMock.mockReset();
  });

  test("deletes grant when shareable link file is missing", async () => {
    const { consumeDownloadGrantForUrl } = await import("../component/download.js");
    const ctx = makeCtx();
    findFileByStorageIdMock.mockResolvedValueOnce(null);

    const result = await getHandler(consumeDownloadGrantForUrl)(ctx, {
      downloadToken: "grant",
    });

    expect(result).toEqual({ status: "file_missing" });
    expect(ctx.db.delete).toHaveBeenCalledWith("grant");
  });

  test("handles missing file after initial shareable check", async () => {
    const { consumeDownloadGrantForUrl } = await import("../component/download.js");
    const ctx = makeCtx();
    let calls = 0;
    const thenable = {
      then: (resolve: (value: any) => void) => {
        calls += 1;
        resolve(calls === 1 ? { storageProvider: "convex" } : null);
      },
    };
    findFileByStorageIdMock.mockReturnValueOnce(thenable as any);

    const result = await getHandler(consumeDownloadGrantForUrl)(ctx, {
      downloadToken: "grant",
    });

    expect(result).toEqual({ status: "file_missing" });
    expect(ctx.db.delete).toHaveBeenCalledWith("grant");
  });
});
