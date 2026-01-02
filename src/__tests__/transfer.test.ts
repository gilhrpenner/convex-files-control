import { afterEach, describe, expect, test, vi } from "vitest";
import {
  commitTransfer,
  getFileByVirtualPathForTransfer,
  getFileForTransfer,
  transferFile,
  updateVirtualPathInternal,
} from "../component/transfer.js";
import * as r2 from "../component/r2.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";

const r2Config = {
  accountId: "acct",
  accessKeyId: "access",
  secretAccessKey: "secret",
  bucketName: "bucket",
};

function getHandler(fn: unknown) {
  return (fn as { _handler: (...args: any[]) => any })._handler;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("getFileForTransfer", () => {
  test("returns null when file missing", async () => {
    const ctx = {
      db: {
        query: () => ({
          withIndex: () => ({
            first: async () => null,
          }),
        }),
      },
    } as any;

    const result = await getHandler(getFileForTransfer)(ctx, {
      storageId: "missing",
    });
    expect(result).toBeNull();
  });

  test("returns file summary when found", async () => {
    const file = {
      _id: "file-id",
      storageId: "storage",
      storageProvider: "convex",
      virtualPath: null,
    };
    const ctx = {
      db: {
        query: () => ({
          withIndex: () => ({
            first: async () => file,
          }),
        }),
      },
    } as any;

    const result = await getHandler(getFileForTransfer)(ctx, {
      storageId: "storage",
    });

    expect(result).toEqual(file);
  });

  test("returns file summary when virtualPath set", async () => {
    const file = {
      _id: "file-id",
      storageId: "storage",
      storageProvider: "convex",
      virtualPath: "/path/file.txt",
    };
    const ctx = {
      db: {
        query: () => ({
          withIndex: () => ({
            first: async () => file,
          }),
        }),
      },
    } as any;

    const result = await getHandler(getFileForTransfer)(ctx, {
      storageId: "storage",
    });

    expect(result).toEqual(file);
  });
});

describe("getFileByVirtualPathForTransfer", () => {
  test("returns null when file missing", async () => {
    const ctx = {
      db: {
        query: () => ({
          withIndex: () => ({
            first: async () => null,
          }),
        }),
      },
    } as any;

    const result = await getHandler(getFileByVirtualPathForTransfer)(ctx, {
      virtualPath: "/missing",
    });
    expect(result).toBeNull();
  });

  test("returns file summary when found", async () => {
    const file = {
      _id: "file-id",
      storageId: "storage",
      storageProvider: "convex",
      virtualPath: "/path/file.txt",
    };
    const ctx = {
      db: {
        query: () => ({
          withIndex: () => ({
            first: async () => file,
          }),
        }),
      },
    } as any;

    const result = await getHandler(getFileByVirtualPathForTransfer)(ctx, {
      virtualPath: "/path/file.txt",
    });

    expect(result).toEqual(file);
  });

  test("returns file summary when virtualPath is null", async () => {
    const file = {
      _id: "file-id",
      storageId: "storage",
      storageProvider: "convex",
      virtualPath: null,
    };
    const ctx = {
      db: {
        query: () => ({
          withIndex: () => ({
            first: async () => file,
          }),
        }),
      },
    } as any;

    const result = await getHandler(getFileByVirtualPathForTransfer)(ctx, {
      virtualPath: "/path/file.txt",
    });

    expect(result).toEqual(file);
  });
});

describe("transferFile", () => {
  test("throws when file not found", async () => {
    const ctx = {
      runQuery: vi.fn(async () => null),
    } as any;

    await expect(
      getHandler(transferFile)(ctx, {
        storageId: "missing",
        targetProvider: "convex",
      }),
    ).rejects.toThrow("File not found.");
  });

  test("throws when already in target provider", async () => {
    const ctx = {
      runQuery: vi.fn(async () => ({
        _id: "file",
        storageId: "storage",
        storageProvider: "convex",
      })),
    } as any;

    await expect(
      getHandler(transferFile)(ctx, {
        storageId: "storage",
        targetProvider: "convex",
      }),
    ).rejects.toThrow("File already stored in target provider.");
  });

  test("throws when r2 config missing", async () => {
    const ctx = {
      runQuery: vi.fn(async () => ({
        _id: "file",
        storageId: "storage",
        storageProvider: "convex",
      })),
    } as any;

    await expect(
      getHandler(transferFile)(ctx, {
        storageId: "storage",
        targetProvider: "r2",
      }),
    ).rejects.toThrow("R2 configuration is required for R2 transfers.");
  });

  test("throws when virtualPath is empty", async () => {
    const ctx = {
      runQuery: vi.fn(async () => ({
        _id: "file",
        storageId: "storage",
        storageProvider: "convex",
      })),
    } as any;

    await expect(
      getHandler(transferFile)(ctx, {
        storageId: "storage",
        targetProvider: "convex",
        virtualPath: "   ",
      }),
    ).rejects.toThrow("Virtual path cannot be empty.");
  });

  test("throws when source url missing or fetch fails", async () => {
    const ctxNoUrl = {
      runQuery: vi.fn(async () => ({
        _id: "file",
        storageId: "storage",
        storageProvider: "convex",
      })),
      storage: {
        getUrl: vi.fn(async () => null),
      },
    } as any;

    await expect(
      getHandler(transferFile)(ctxNoUrl, {
        storageId: "storage",
        targetProvider: "r2",
        r2Config,
      }),
    ).rejects.toThrow("File not found.");

    const ctxFetchFail = {
      runQuery: vi.fn(async () => ({
        _id: "file",
        storageId: "storage",
        storageProvider: "convex",
      })),
      storage: {
        getUrl: vi.fn(async () => "https://source.example.com"),
      },
    } as any;

    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));

    await expect(
      getHandler(transferFile)(ctxFetchFail, {
        storageId: "storage",
        targetProvider: "r2",
        r2Config,
      }),
    ).rejects.toThrow("File not found.");
  });

  test("throws when target storageId already exists", async () => {
    const file = {
      _id: "file",
      storageId: "storage",
      storageProvider: "convex",
      virtualPath: null,
    };
    const runQuery = vi.fn(async (_query, args) => {
      if ("virtualPath" in args) {
        return null;
      }
      if (args.storageId === "storage") {
        return file;
      }
      if (args.storageId === "existing") {
        return {
          _id: "other-file",
          storageId: "existing",
          storageProvider: "r2",
          virtualPath: null,
        };
      }
      return null;
    });

    const ctx = { runQuery } as any;

    await expect(
      getHandler(transferFile)(ctx, {
        storageId: "storage",
        targetProvider: "r2",
        r2Config,
        virtualPath: "existing",
      }),
    ).rejects.toThrow("Storage ID already exists.");
  });

  test("throws when virtual path already exists", async () => {
    const file = {
      _id: "file",
      storageId: "storage",
      storageProvider: "convex",
      virtualPath: null,
    };
    const runQuery = vi.fn(async (_query, args) => {
      if ("virtualPath" in args) {
        return {
          _id: "other-file",
          storageId: "other",
          storageProvider: "convex",
        };
      }
      return file;
    });

    const ctx = { runQuery } as any;

    await expect(
      getHandler(transferFile)(ctx, {
        storageId: "storage",
        targetProvider: "convex",
        virtualPath: "/existing/path.txt",
      }),
    ).rejects.toThrow("Virtual path already exists.");
  });

  test("transfers r2 source to convex target", async () => {
    const ctx = {
      runQuery: vi.fn(async () => ({
        _id: "file",
        storageId: "storage",
        storageProvider: "r2",
      })),
      runMutation: vi.fn(async () => ({
        storageId: "new-storage",
        storageProvider: "convex",
        virtualPath: null,
      })),
      storage: {
        store: vi.fn(async () => "new-storage"),
      },
    } as any;

    vi.spyOn(r2, "getR2DownloadUrl").mockResolvedValue(
      "https://r2-download.example.com",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("data", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    const result = await getHandler(transferFile)(ctx, {
      storageId: "storage",
      targetProvider: "convex",
      r2Config,
    });

    expect(result).toEqual({
      storageId: "new-storage",
      storageProvider: "convex",
      virtualPath: null,
    });
    expect(ctx.runMutation).toHaveBeenCalled();
  });

  test("transferFile uses r2 download url for r2 sources", async () => {
    const getUrl = vi.fn();
    const ctx = {
      runQuery: vi.fn(async () => ({
        _id: "file",
        storageId: "storage",
        storageProvider: "r2",
      })),
      runMutation: vi.fn(async () => ({
        storageId: "new-storage",
        storageProvider: "convex",
        virtualPath: null,
      })),
      storage: {
        getUrl,
        store: vi.fn(async () => "new-storage"),
      },
    } as any;

    const downloadSpy = vi
      .spyOn(r2, "getR2DownloadUrl")
      .mockResolvedValue("https://r2-download.example.com");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("data", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    await getHandler(transferFile)(ctx, {
      storageId: "storage",
      targetProvider: "convex",
      r2Config,
    });

    expect(downloadSpy).toHaveBeenCalledWith(r2Config, "storage");
    expect(getUrl).not.toHaveBeenCalled();
  });

  test("transfers convex source to r2 target", async () => {
    const send = vi.fn(async () => ({}));
    vi.spyOn(r2, "createR2Client").mockReturnValue({ send } as any);

    vi.stubGlobal("crypto", {
      randomUUID: () => "r2-id",
    } as any);

    const ctx = {
      runQuery: vi.fn(async () => ({
        _id: "file",
        storageId: "storage",
        storageProvider: "convex",
      })),
      runMutation: vi.fn(async () => ({
        storageId: "r2-id",
        storageProvider: "r2",
        virtualPath: null,
      })),
      storage: {
        getUrl: vi.fn(async () => "https://convex.example.com"),
      },
    } as any;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers(),
        arrayBuffer: async () => new TextEncoder().encode("data").buffer,
      })),
    );

    const result = await getHandler(transferFile)(ctx, {
      storageId: "storage",
      targetProvider: "r2",
      r2Config,
    });

    expect(result.storageProvider).toBe("r2");
    expect(send).toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand);
  });

  test("transfers convex source to r2 target with virtualPath", async () => {
    const send = vi.fn(async () => ({}));
    vi.spyOn(r2, "createR2Client").mockReturnValue({ send } as any);

    const ctx = {
      runQuery: vi.fn(async (_ref, args) => {
        if ("virtualPath" in args) {
          return null;
        }
        return {
          _id: "file",
          storageId: "storage",
          storageProvider: "convex",
          virtualPath: null,
        };
      }),
      runMutation: vi.fn(async () => ({
        storageId: "/uploads/target.txt",
        storageProvider: "r2",
        virtualPath: "/uploads/target.txt",
      })),
      storage: {
        getUrl: vi.fn(async () => "https://convex.example.com"),
      },
    } as any;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers(),
        arrayBuffer: async () => new TextEncoder().encode("data").buffer,
      })),
    );

    const result = await getHandler(transferFile)(ctx, {
      storageId: "storage",
      targetProvider: "r2",
      r2Config,
      virtualPath: "/uploads/target.txt",
    });

    expect(result.virtualPath).toBe("/uploads/target.txt");
    expect(send).toHaveBeenCalled();
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ virtualPath: "/uploads/target.txt" }),
    );
  });

  test("uses randomUUID fallback when plannedStorageId is null", async () => {
    const send = vi.fn(async () => ({}));
    vi.spyOn(r2, "createR2Client").mockReturnValue({ send } as any);

    let callCount = 0;
    vi.stubGlobal("crypto", {
      randomUUID: () => {
        callCount += 1;
        return callCount === 1 ? (null as any) : "generated";
      },
    } as any);

    const ctx = {
      runQuery: vi.fn(async () => ({
        _id: "file",
        storageId: "storage",
        storageProvider: "convex",
        virtualPath: null,
      })),
      runMutation: vi.fn(async (ref: unknown, args: any) => ({
        storageId: args.newStorageId,
        storageProvider: "r2",
        virtualPath: args.virtualPath ?? null,
      })),
      storage: {
        getUrl: vi.fn(async () => "https://convex.example.com"),
      },
    } as any;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers(),
        arrayBuffer: async () => new TextEncoder().encode("data").buffer,
      })),
    );

    const result = await getHandler(transferFile)(ctx, {
      storageId: "storage",
      targetProvider: "r2",
      r2Config,
    });

    expect(result.storageId).toBe("generated");
  });

  test("throws when source provider is unrecognized", async () => {
    const ctx = {
      runQuery: vi.fn(async () => ({
        _id: "file",
        storageId: "storage",
        storageProvider: "unknown",
      })),
      storage: {
        getUrl: vi.fn(),
      },
    } as any;

    await expect(
      getHandler(transferFile)(ctx, {
        storageId: "storage",
        targetProvider: "convex",
      }),
    ).rejects.toThrow("File not found.");
  });

  test("transfers with needsR2 false uses undefined r2Config", async () => {
    let providerReads = 0;
    const file = {
      _id: "file",
      storageId: "storage",
      get storageProvider() {
        providerReads += 1;
        if (providerReads === 1) return "r2";
        return "convex";
      },
    };

    const ctx = {
      runQuery: vi.fn(async () => file),
      runMutation: vi.fn(async () => ({
        storageId: "new",
        storageProvider: "convex",
        virtualPath: null,
      })),
      storage: {
        getUrl: vi.fn(async () => "https://source.example.com"),
        store: vi.fn(async () => "new"),
      },
    } as any;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("data", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    await getHandler(transferFile)(ctx, {
      storageId: "storage",
      targetProvider: "convex",
    });

    const r2ConfigArgs = ctx.runMutation.mock.calls
      .map((call) => call[1])
      .find((value) => value && typeof value === "object" && "r2Config" in value);
    expect(r2ConfigArgs?.r2Config).toBeUndefined();
  });

  test("transfers with r2Config null when providers flip", async () => {
    let providerReads = 0;
    const file = {
      _id: "file",
      storageId: "storage",
      get storageProvider() {
        providerReads += 1;
        if (providerReads <= 2) return "r2";
        return "convex";
      },
    };

    const ctx = {
      runQuery: vi.fn(async () => file),
      runMutation: vi.fn(async () => ({
        storageId: "new",
        storageProvider: "convex",
        virtualPath: null,
      })),
      storage: {
        getUrl: vi.fn(async () => "https://source.example.com"),
        store: vi.fn(async () => "new"),
      },
    } as any;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("data", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    await getHandler(transferFile)(ctx, {
      storageId: "storage",
      targetProvider: "convex",
    });

    const r2ConfigArgs = ctx.runMutation.mock.calls
      .map((call) => call[1])
      .find((value) => value && typeof value === "object" && "r2Config" in value);
    expect(r2ConfigArgs?.r2Config).toBeUndefined();
  });

  test("infers filename when virtualPath ends with a slash", async () => {
    const file = {
      _id: "file",
      storageId: "storage",
      storageProvider: "convex",
      virtualPath: null,
    };
    const runQuery = vi.fn(async (_ref, args) => {
      if ("virtualPath" in args) {
        return null;
      }
      return file;
    });
    const runMutation = vi.fn(async (_ref, args) => ({
      storageId: args.storageId,
      storageProvider: "convex",
      virtualPath: args.virtualPath ?? null,
    }));

    const ctx = { runQuery, runMutation } as any;

    const result = await getHandler(transferFile)(ctx, {
      storageId: "storage",
      targetProvider: "convex",
      virtualPath: "/uploads/",
    });

    expect(result.virtualPath).toBe("/uploads/storage");
    expect(runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ virtualPath: "/uploads/storage" }),
    );
  });

  test("handles inferred name that resolves to empty", async () => {
    const file = {
      _id: "file",
      storageId: "storage",
      storageProvider: "convex",
      virtualPath: {
        replace: () => "name/",
      } as any,
    };
    const runQuery = vi.fn(async (_ref, args) => {
      if ("virtualPath" in args) {
        return null;
      }
      return file;
    });
    const runMutation = vi.fn(async (_ref, args) => ({
      storageId: args.storageId,
      storageProvider: "convex",
      virtualPath: args.virtualPath ?? null,
    }));

    const ctx = { runQuery, runMutation } as any;

    const result = await getHandler(transferFile)(ctx, {
      storageId: "storage",
      targetProvider: "convex",
      virtualPath: "/uploads/",
    });

    expect(result.virtualPath).toBe("/uploads/storage");
  });

  test("throws when trailing slash cannot infer filename", async () => {
    const ctx = {
      runQuery: vi.fn(async () => ({
        _id: "file",
        storageId: "/",
        storageProvider: "convex",
        virtualPath: "/",
      })),
    } as any;

    await expect(
      getHandler(transferFile)(ctx, {
        storageId: "/",
        targetProvider: "convex",
        virtualPath: "/uploads/",
      }),
    ).rejects.toThrow(
      "Virtual path ends with '/' but filename could not be inferred. Provide a full path.",
    );
  });
});

describe("updateVirtualPathInternal", () => {
  test("throws when file missing", async () => {
    const ctx = {
      db: {
        query: () => ({
          withIndex: () => ({
            first: async () => null,
          }),
        }),
      },
    } as any;

    await expect(
      getHandler(updateVirtualPathInternal)(ctx, {
        storageId: "missing",
        virtualPath: "/path",
      }),
    ).rejects.toThrow("File not found.");
  });

  test("updates virtualPath and returns summary", async () => {
    const file = {
      _id: "file",
      storageId: "storage",
      storageProvider: "convex",
      virtualPath: null,
    };
    const ctx = {
      db: {
        query: () => ({
          withIndex: () => ({
            first: async () => file,
          }),
        }),
        patch: vi.fn(async () => undefined),
      },
    } as any;

    const result = await getHandler(updateVirtualPathInternal)(ctx, {
      storageId: "storage",
      virtualPath: "/path/file.txt",
    });

    expect(ctx.db.patch).toHaveBeenCalledWith("file", {
      virtualPath: "/path/file.txt",
    });
    expect(result).toEqual({
      storageId: "storage",
      storageProvider: "convex",
      virtualPath: "/path/file.txt",
    });
  });

  test("clears virtualPath when null provided", async () => {
    const file = {
      _id: "file",
      storageId: "storage",
      storageProvider: "convex",
      virtualPath: "/old",
    };
    const ctx = {
      db: {
        query: () => ({
          withIndex: () => ({
            first: async () => file,
          }),
        }),
        patch: vi.fn(async () => undefined),
      },
    } as any;

    const result = await getHandler(updateVirtualPathInternal)(ctx, {
      storageId: "storage",
      virtualPath: null,
    });

    expect(ctx.db.patch).toHaveBeenCalledWith("file", {
      virtualPath: undefined,
    });
    expect(result).toEqual({
      storageId: "storage",
      storageProvider: "convex",
      virtualPath: null,
    });
  });
});

describe("commitTransfer", () => {
  test("throws when file missing", async () => {
    const ctx = {
      db: {
        query: () => ({
          withIndex: () => ({
            first: async () => null,
            collect: async () => [],
          }),
        }),
      },
    } as any;

    await expect(
      getHandler(commitTransfer)(ctx, {
        storageId: "missing",
        newStorageId: "new",
        targetProvider: "convex",
        sourceProvider: "convex",
      }),
    ).rejects.toThrow("File not found.");
  });

  test("throws when provider changed", async () => {
    const ctx = {
      db: {
        query: () => ({
          withIndex: () => ({
            first: async () => ({
              _id: "file",
              storageId: "storage",
              storageProvider: "convex",
            }),
            collect: async () => [],
          }),
        }),
      },
    } as any;

    await expect(
      getHandler(commitTransfer)(ctx, {
        storageId: "storage",
        newStorageId: "new",
        targetProvider: "r2",
        sourceProvider: "r2",
      }),
    ).rejects.toThrow("File provider changed during transfer.");
  });

  test("updates records and deletes convex storage", async () => {
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

    const result = await getHandler(commitTransfer)(ctx, {
      storageId: "storage",
      newStorageId: "new",
      targetProvider: "r2",
      sourceProvider: "convex",
    });

    expect(result.storageId).toBe("new");
    expect(ctx.storage.delete).toHaveBeenCalled();
  });

  test("updates virtualPath when provided", async () => {
    const ctx = {
      db: {
        query: () => ({
          withIndex: () => ({
            first: async () => ({
              _id: "file",
              storageId: "storage",
              storageProvider: "convex",
              virtualPath: "/old",
            }),
            collect: async () => [],
          }),
        }),
        patch: vi.fn(async () => undefined),
      },
      storage: {
        delete: vi.fn(async () => undefined),
      },
    } as any;

    const result = await getHandler(commitTransfer)(ctx, {
      storageId: "storage",
      newStorageId: "new",
      targetProvider: "convex",
      sourceProvider: "convex",
      virtualPath: "/new/path.txt",
    });

    expect(ctx.db.patch).toHaveBeenCalledWith(
      "file",
      expect.objectContaining({ virtualPath: "/new/path.txt" }),
    );
    expect(result.virtualPath).toBe("/new/path.txt");
  });

  test("clears virtualPath when null provided", async () => {
    const ctx = {
      db: {
        query: () => ({
          withIndex: () => ({
            first: async () => ({
              _id: "file",
              storageId: "storage",
              storageProvider: "convex",
              virtualPath: "/old",
            }),
            collect: async () => [],
          }),
        }),
        patch: vi.fn(async () => undefined),
      },
      storage: {
        delete: vi.fn(async () => undefined),
      },
    } as any;

    const result = await getHandler(commitTransfer)(ctx, {
      storageId: "storage",
      newStorageId: "new",
      targetProvider: "convex",
      sourceProvider: "convex",
      virtualPath: null,
    });

    expect(result.virtualPath).toBeNull();
  });

  test("commitTransfer invokes index callbacks for access and grants", async () => {
    const file = {
      _id: "file",
      storageId: "storage",
      storageProvider: "convex",
    };
    const queryObj = {
      eq: vi.fn(() => queryObj),
    };

    const ctx = {
      db: {
        query: (table: string) => ({
          withIndex: (_index: string, cb?: (q: typeof queryObj) => void) => {
            if (cb) {
              cb(queryObj);
            }
            return {
              first: async () => (table === "files" ? file : null),
              collect: async () => [],
            };
          },
        }),
        patch: vi.fn(async () => undefined),
      },
      storage: {
        delete: vi.fn(async () => undefined),
      },
    } as any;

    await getHandler(commitTransfer)(ctx, {
      storageId: "storage",
      newStorageId: "new",
      targetProvider: "convex",
      sourceProvider: "convex",
    });

    expect(queryObj.eq).toHaveBeenCalledWith("fileId", "file");
    expect(queryObj.eq).toHaveBeenCalledWith("storageId", "storage");
  });

  test("updates records and deletes r2 storage", async () => {
    const deleteSpy = vi
      .spyOn(r2, "deleteR2Object")
      .mockResolvedValue(undefined);

    const ctx = {
      db: {
        query: (table: string) => ({
          withIndex: () => ({
            first: async () => ({
              _id: "file",
              storageId: "storage",
              storageProvider: "r2",
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

    const result = await getHandler(commitTransfer)(ctx, {
      storageId: "storage",
      newStorageId: "new",
      targetProvider: "convex",
      sourceProvider: "r2",
      r2Config,
    });

    expect(result.storageProvider).toBe("convex");
    expect(deleteSpy).toHaveBeenCalledWith(r2Config, "storage");
  });
});
