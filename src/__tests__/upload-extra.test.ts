import { afterEach, describe, expect, test, vi } from "vitest";
import {
  computeR2Metadata,
  finalizeUpload,
  generateUploadUrl,
} from "../component/upload.js";
import * as r2 from "../component/r2.js";
import { Buffer } from "node:buffer";

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

describe("upload module", () => {
  test("generateUploadUrl returns r2 upload info", async () => {
    const uploadSpy = vi
      .spyOn(r2, "getR2UploadUrl")
      .mockResolvedValue("https://r2-upload.example.com");

    vi.stubGlobal("crypto", {
      randomUUID: () => "uuid",
      subtle: crypto.subtle,
      getRandomValues: crypto.getRandomValues.bind(crypto),
    } as any);

    const ctx = {
      storage: {
        generateUploadUrl: vi.fn(async () => "https://convex-upload"),
      },
      db: {
        insert: vi.fn(async () => "pending-id"),
      },
    } as any;

    const result = await getHandler(generateUploadUrl)(ctx, {
      provider: "r2",
      r2Config,
    });

    expect(result.storageProvider).toBe("r2");
    expect(result.storageId).toBe("uuid");
    expect(result.uploadUrl).toBe("https://r2-upload.example.com");
    expect(uploadSpy).toHaveBeenCalledWith(r2Config, "uuid");
  });

  test("finalizeUpload validates pending uploads", async () => {
    const missingCtx = {
      db: {
        get: vi.fn(async () => null),
      },
    } as any;

    await expect(
      getHandler(finalizeUpload)(missingCtx, {
        uploadToken: "missing",
        storageId: "storage",
        accessKeys: ["a"],
      }),
    ).rejects.toThrow("Upload token not found.");

    const expiredCtx = {
      db: {
        get: vi.fn(async () => ({
          expiresAt: Date.now() - 1,
          storageProvider: "convex",
        })),
      },
    } as any;

    await expect(
      getHandler(finalizeUpload)(expiredCtx, {
        uploadToken: "expired",
        storageId: "storage",
        accessKeys: ["a"],
      }),
    ).rejects.toThrow("Upload token expired.");

    const mismatchCtx = {
      db: {
        get: vi.fn(async () => ({
          expiresAt: Date.now() + 1000,
          storageProvider: "convex",
          storageId: "expected",
        })),
      },
    } as any;

    await expect(
      getHandler(finalizeUpload)(mismatchCtx, {
        uploadToken: "mismatch",
        storageId: "other",
        accessKeys: ["a"],
      }),
    ).rejects.toThrow("Storage ID does not match pending upload.");
  });

  test("finalizeUpload registers r2 uploads", async () => {
    const ctx = {
      db: {
        get: vi.fn(async () => ({
          expiresAt: Date.now() + 1000,
          storageProvider: "r2",
        })),
        delete: vi.fn(async () => undefined),
        insert: vi.fn(async () => "file-id"),
        query: () => ({
          withIndex: () => ({
            first: async () => null,
          }),
        }),
        system: {
          get: vi.fn(async () => null),
        },
      },
    } as any;

    const result = await getHandler(finalizeUpload)(ctx, {
      uploadToken: "token",
      storageId: "storage",
      accessKeys: ["a"],
    });

    expect(result.storageId).toBe("storage");
    expect(result.storageProvider).toBe("r2");
    expect(result.metadata).toBeNull();
  });

  test("computeR2Metadata returns metadata and handles errors", async () => {
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

    const result = await getHandler(computeR2Metadata)({} as any, {
      storageId: "storage",
      r2Config,
    });

    expect(result.storageId).toBe("storage");
    expect(result.size).toBe(4);
    expect(result.contentType).toBe("text/plain");
    expect(result.sha256).toBeTypeOf("string");
    expect(downloadSpy).toHaveBeenCalledWith(r2Config, "storage");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 })),
    );

    await expect(
      getHandler(computeR2Metadata)({} as any, { storageId: "x", r2Config }),
    ).rejects.toThrow("R2 file not found.");
  });

  test("computeR2Metadata uses Buffer base64 when btoa is missing", async () => {
    vi.stubGlobal("btoa", undefined as any);
    vi.stubGlobal("Buffer", Buffer as any);

    vi.spyOn(r2, "getR2DownloadUrl").mockResolvedValue(
      "https://r2-download.example.com",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers(),
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      })),
    );

    const result = await getHandler(computeR2Metadata)({} as any, {
      storageId: "storage",
      r2Config,
    });

    expect(result.sha256).toBeTypeOf("string");
    expect(result.contentType).toBeNull();
  });
});
