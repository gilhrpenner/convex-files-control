import { describe, expect, test, vi } from "vitest";
import { api } from "../component/_generated/api.js";
import type { Id } from "../component/_generated/dataModel.js";
import { deleteFileCascade } from "../component/cleanUp.js";
import { normalizeAccessKeys } from "../component/lib.js";
import schema from "../component/schema.js";
import { initConvexTest } from "../component/setup.test.js";

type TestContext = ReturnType<typeof initConvexTest>;
type StorageId = string;
type FileId = Id<"files">;
type DownloadGrantId = Id<"downloadGrants">;
type PendingUploadId = Id<"pendingUploads">;

const defaultLimit = 100;
const defaultPaginationOpts = { numItems: defaultLimit, cursor: null };

type FileMetadata = {
  size: number;
  sha256: string;
  contentType: string | null;
};

type RegisterOptions = {
  accessKeys?: string[];
  expiresAt?: number | null;
  metadata?: FileMetadata;
};

type DownloadGrantInput = {
  storageId: StorageId;
  expiresAt?: number | null;
  maxUses: number | null;
  useCount: number;
};

async function createStorageFile(t: TestContext, content = "file") {
  const blob = new Blob([content]);
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(blob);
    const metadata = await ctx.db.system.get(storageId);
    return { storageId, metadata };
  });
}

async function createRegisteredFile(t: TestContext, options: RegisterOptions = {}) {
  const { storageId } = await createStorageFile(t);
  const args: {
    storageId: StorageId;
    storageProvider: "convex" | "r2";
    accessKeys: string[];
    expiresAt?: number | null;
    metadata?: FileMetadata;
  } = {
    storageId,
    storageProvider: "convex",
    accessKeys: options.accessKeys ?? ["key"],
  };
  if (options.expiresAt !== undefined) {
    args.expiresAt = options.expiresAt;
  }
  if (options.metadata !== undefined) {
    args.metadata = options.metadata;
  }
  const result = await t.mutation(api.upload.registerFile, args);
  return { storageId, result };
}

async function insertFileRecord(
  t: TestContext,
  storageId: StorageId,
  expiresAt?: number,
  storageProvider: "convex" | "r2" = "convex",
) {
  return await t.run(async (ctx) => {
    const data =
      expiresAt === undefined
        ? { storageId, storageProvider }
        : { storageId, storageProvider, expiresAt };
    return await ctx.db.insert("files", data);
  });
}

async function insertFileAccess(
  t: TestContext,
  fileId: FileId,
  storageId: StorageId,
  accessKey: string,
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("fileAccess", { fileId, storageId, accessKey });
  });
}

async function insertDownloadGrant(t: TestContext, input: DownloadGrantInput) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("downloadGrants", {
      storageId: input.storageId,
      expiresAt: input.expiresAt ?? undefined,
      maxUses: input.maxUses,
      useCount: input.useCount,
    });
  });
}

async function insertPendingUpload(
  t: TestContext,
  expiresAt: number,
  storageProvider: "convex" | "r2" = "convex",
  storageId?: string,
): Promise<PendingUploadId> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("pendingUploads", {
      expiresAt,
      storageProvider,
      storageId,
    });
  });
}

describe("component exports", () => {
  test("schema is exported", () => {
    expect(schema).toBeDefined();
  });

  test("normalizeAccessKeys trims and dedupes", () => {
    expect(normalizeAccessKeys([" a ", "a", "", "  b ", "b"])).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("access control", () => {
  test("addAccessKey validates and inserts", async () => {
    const t = initConvexTest();
    const { storageId: unregisteredId } = await createStorageFile(t, "missing");

    await expect(
      t.mutation(api.accessControl.addAccessKey, {
        storageId: unregisteredId,
        accessKey: "key",
      }),
    ).rejects.toThrowError("File not found.");

    await expect(
      t.mutation(api.accessControl.addAccessKey, {
        storageId: unregisteredId,
        accessKey: "  ",
      }),
    ).rejects.toThrowError("Access key cannot be empty.");

    const { storageId } = await createStorageFile(t, "registered");
    await t.mutation(api.upload.registerFile, {
      storageId,
      storageProvider: "convex",
      accessKeys: ["first"],
    });

    const result = await t.mutation(api.accessControl.addAccessKey, {
      storageId,
      accessKey: " second ",
    });

    expect(result).toEqual({ accessKey: "second" });

    await expect(
      t.mutation(api.accessControl.addAccessKey, {
        storageId,
        accessKey: "second",
      }),
    ).rejects.toThrowError("Access key already exists for this file.");
  });

  test("removeAccessKey validates and removes", async () => {
    const t = initConvexTest();
    const { storageId: missingFileId } = await createStorageFile(t, "missing");

    await expect(
      t.mutation(api.accessControl.removeAccessKey, {
        storageId: missingFileId,
        accessKey: "key",
      }),
    ).rejects.toThrowError("File not found.");

    const { storageId } = await createStorageFile(t, "multi");
    await t.mutation(api.upload.registerFile, {
      storageId,
      storageProvider: "convex",
      accessKeys: ["alpha", "beta"],
    });

    await expect(
      t.mutation(api.accessControl.removeAccessKey, {
        storageId,
        accessKey: " ",
      }),
    ).rejects.toThrowError("Access key cannot be empty.");

    await expect(
      t.mutation(api.accessControl.removeAccessKey, {
        storageId,
        accessKey: "missing",
      }),
    ).rejects.toThrowError("Access key not found for this file.");

    const removed = await t.mutation(api.accessControl.removeAccessKey, {
      storageId,
      accessKey: "alpha",
    });

    expect(removed).toEqual({ removed: true });

    const remaining = await t.query(api.queries.listAccessKeysPage, {
      storageId,
      paginationOpts: defaultPaginationOpts,
    });
    expect(remaining.page).toEqual(["beta"]);

    const { storageId: singleId } = await createStorageFile(t, "single");
    await t.mutation(api.upload.registerFile, {
      storageId: singleId,
      storageProvider: "convex",
      accessKeys: ["solo"],
    });

    await expect(
      t.mutation(api.accessControl.removeAccessKey, {
        storageId: singleId,
        accessKey: "solo",
      }),
    ).rejects.toThrowError("Cannot remove the last access key from a file.");
  });

  test("updateFileExpiration validates and updates", async () => {
    const t = initConvexTest();
    const { storageId: missingFileId } = await createStorageFile(t, "missing");

    await expect(
      t.mutation(api.accessControl.updateFileExpiration, {
        storageId: missingFileId,
        expiresAt: Date.now() + 1000,
      }),
    ).rejects.toThrowError("File not found.");

    const { storageId } = await createStorageFile(t, "file");
    await t.mutation(api.upload.registerFile, {
      storageId,
      storageProvider: "convex",
      accessKeys: ["key"],
    });

    await expect(
      t.mutation(api.accessControl.updateFileExpiration, {
        storageId,
        expiresAt: Date.now() - 1000,
      }),
    ).rejects.toThrowError("Expiration must be in the future.");

    const future = Date.now() + 60_000;
    const result = await t.mutation(api.accessControl.updateFileExpiration, {
      storageId,
      expiresAt: future,
    });

    expect(result).toEqual({ expiresAt: future });

    const cleared = await t.mutation(api.accessControl.updateFileExpiration, {
      storageId,
      expiresAt: null,
    });

    expect(cleared).toEqual({ expiresAt: null });
  });
});

describe("upload", () => {
  test("generateUploadUrl creates pending upload", async () => {
    const t = initConvexTest();
    const result = await t.mutation(api.upload.generateUploadUrl, {
      provider: "convex",
    });

    expect(result.uploadUrl).toBeTypeOf("string");
    expect(result.uploadToken).toBeDefined();
    expect(result.uploadTokenExpiresAt).toBeGreaterThan(Date.now());
    expect(result.storageProvider).toBe("convex");
    expect(result.storageId).toBeNull();

    const pending = await t.run(async (ctx) => {
      return await ctx.db.get("pendingUploads", result.uploadToken);
    });

    expect(pending?.expiresAt).toBe(result.uploadTokenExpiresAt);
    expect(pending?.storageProvider).toBe("convex");
  });

  test("finalizeUpload validates tokens and registers files", async () => {
    const t = initConvexTest();
    const { storageId } = await createStorageFile(t, "upload");

    const expiredToken = await insertPendingUpload(t, Date.now() - 1);
    await expect(
      t.mutation(api.upload.finalizeUpload, {
        uploadToken: expiredToken,
        storageId,
        accessKeys: ["key"],
      }),
    ).rejects.toThrowError("Upload token expired.");

    const missingToken = await insertPendingUpload(t, Date.now() + 60_000);
    await t.run(async (ctx) => {
      await ctx.db.delete(missingToken);
    });

    await expect(
      t.mutation(api.upload.finalizeUpload, {
        uploadToken: missingToken,
        storageId,
        accessKeys: ["key"],
      }),
    ).rejects.toThrowError("Upload token not found.");

    const { uploadToken } = await t.mutation(api.upload.generateUploadUrl, {
      provider: "convex",
    });
    const result = await t.mutation(api.upload.finalizeUpload, {
      uploadToken,
      storageId,
      accessKeys: [" key ", "key", "other"],
      expiresAt: null,
    });

    expect(result.storageId).toBe(storageId);
    expect(result.storageProvider).toBe("convex");
    expect(result.expiresAt).toBeNull();
    expect(result.metadata?.storageId).toBe(storageId);

    const keys = await t.query(api.queries.listAccessKeysPage, {
      storageId,
      paginationOpts: defaultPaginationOpts,
    });
    expect(keys.page.sort()).toEqual(["key", "other"]);

    const pending = await t.run(async (ctx) => {
      return await ctx.db.get("pendingUploads", uploadToken);
    });

    expect(pending).toBeNull();
  });

  test("registerFile validates and returns metadata", async () => {
    const t = initConvexTest();
    const { storageId: storageA } = await createStorageFile(t, "a");

    await expect(
      t.mutation(api.upload.registerFile, {
        storageId: storageA,
        storageProvider: "convex",
        accessKeys: [],
      }),
    ).rejects.toThrowError("At least one accessKey is required.");

    await expect(
      t.mutation(api.upload.registerFile, {
        storageId: storageA,
        storageProvider: "convex",
        accessKeys: ["key"],
        expiresAt: Date.now() - 1,
      }),
    ).rejects.toThrowError("Expiration must be in the future.");

    const { storageId: storageMissing } = await createStorageFile(t, "missing");
    await t.run(async (ctx) => {
      await ctx.storage.delete(storageMissing);
    });

    await expect(
      t.mutation(api.upload.registerFile, {
        storageId: storageMissing,
        storageProvider: "convex",
        accessKeys: ["key"],
      }),
    ).rejects.toThrowError("Storage file not found.");

    const { storageId: storageB } = await createStorageFile(t, "b");
    const result = await t.mutation(api.upload.registerFile, {
      storageId: storageB,
      storageProvider: "convex",
      accessKeys: [" key ", "key", "other"],
      metadata: { size: 3, sha256: "abc", contentType: null },
    });

    expect(result.metadata).toEqual({
      storageId: storageB,
      size: 3,
      sha256: "abc",
      contentType: null,
    });

    await expect(
      t.mutation(api.upload.registerFile, {
        storageId: storageB,
        storageProvider: "convex",
        accessKeys: ["other"],
      }),
    ).rejects.toThrowError("File already registered.");
  });
});

describe("download", () => {
  test("createDownloadGrant validates inputs", async () => {
    const t = initConvexTest();
    const { storageId: unregisteredId } = await createStorageFile(t, "missing");

    await expect(
      t.mutation(api.download.createDownloadGrant, {
        storageId: unregisteredId,
      }),
    ).rejects.toThrowError("File not found.");

    const { storageId: expiredStorage } = await createStorageFile(t, "expired");
    await insertFileRecord(t, expiredStorage, Date.now() - 1000);

    await expect(
      t.mutation(api.download.createDownloadGrant, {
        storageId: expiredStorage,
      }),
    ).rejects.toThrowError("File expired.");

    const { storageId } = await createStorageFile(t, "file");
    await t.mutation(api.upload.registerFile, {
      storageId,
      storageProvider: "convex",
      accessKeys: ["key"],
    });

    await expect(
      t.mutation(api.download.createDownloadGrant, {
        storageId,
        maxUses: 0,
      }),
    ).rejects.toThrowError("maxUses must be at least 1 or null for unlimited.");

    await expect(
      t.mutation(api.download.createDownloadGrant, {
        storageId,
        expiresAt: Date.now() - 1,
      }),
    ).rejects.toThrowError("Expiration must be in the future.");

    await expect(
      t.mutation(api.download.createDownloadGrant, {
        storageId,
        password: "   ",
      }),
    ).rejects.toThrowError("Password cannot be empty.");

    const grant = await t.mutation(api.download.createDownloadGrant, {
      storageId,
      maxUses: null,
      expiresAt: null,
    });

    expect(grant.maxUses).toBeNull();
    expect(grant.expiresAt).toBeNull();

    const passwordGrant = await t.mutation(api.download.createDownloadGrant, {
      storageId,
      password: "secret",
    });

    const storedPasswordGrant = await t.run(async (ctx) => {
      return await ctx.db.get("downloadGrants", passwordGrant.downloadToken);
    });

    expect(storedPasswordGrant?.passwordHash).toBeTypeOf("string");
    expect(storedPasswordGrant?.passwordSalt).toBeTypeOf("string");
    expect(storedPasswordGrant?.passwordIterations).toBeTypeOf("number");
    expect(storedPasswordGrant?.passwordAlgorithm).toBe("pbkdf2-sha256");
  });

  test("consumeDownloadGrantForUrl handles statuses", async () => {
    const t = initConvexTest();

    const { storageId: missingGrantStorage } = await createStorageFile(t, "mf");
    const missingGrant = await insertDownloadGrant(t, {
      storageId: missingGrantStorage,
      maxUses: null,
      useCount: 0,
    });

    await t.run(async (ctx) => {
      await ctx.db.delete(missingGrant);
    });

    const notFound = await t.mutation(api.download.consumeDownloadGrantForUrl, {
      downloadToken: missingGrant,
      accessKey: "key",
    });

    expect(notFound).toEqual({ status: "not_found" });

    const { storageId: expiredGrantStorage } = await createStorageFile(
      t,
      "expired",
    );
    const expiredGrant = await insertDownloadGrant(t, {
      storageId: expiredGrantStorage,
      expiresAt: Date.now() - 1,
      maxUses: null,
      useCount: 0,
    });

    const expired = await t.mutation(api.download.consumeDownloadGrantForUrl, {
      downloadToken: expiredGrant,
      accessKey: "key",
    });

    expect(expired).toEqual({ status: "expired" });

    const { storageId: exhaustedStorage } = await createStorageFile(t, "ex");
    const exhaustedGrant = await insertDownloadGrant(t, {
      storageId: exhaustedStorage,
      maxUses: 1,
      useCount: 1,
    });

    const exhausted = await t.mutation(api.download.consumeDownloadGrantForUrl, {
      downloadToken: exhaustedGrant,
      accessKey: "key",
    });

    expect(exhausted).toEqual({ status: "exhausted" });

    const { storageId: missingFileStorage } = await createStorageFile(
      t,
      "missing-file",
    );
    const missingFileGrant = await insertDownloadGrant(t, {
      storageId: missingFileStorage,
      maxUses: null,
      useCount: 0,
    });

    const fileMissing = await t.mutation(api.download.consumeDownloadGrantForUrl, {
      downloadToken: missingFileGrant,
      accessKey: "key",
    });

    expect(fileMissing).toEqual({ status: "file_missing" });

    const missingNoAccessGrant = await insertDownloadGrant(t, {
      storageId: missingFileStorage,
      maxUses: null,
      useCount: 0,
    });

    const missingNoAccess = await t.mutation(
      api.download.consumeDownloadGrantForUrl,
      {
        downloadToken: missingNoAccessGrant,
        accessKey: " ",
      },
    );

    expect(missingNoAccess).toEqual({ status: "file_missing" });

    const { storageId: accessStorage } = await createRegisteredFile(t, {
      accessKeys: ["access"],
    });
    const blankGrant = await insertDownloadGrant(t, {
      storageId: accessStorage,
      maxUses: null,
      useCount: 0,
    });

    const blankAccess = await t.mutation(api.download.consumeDownloadGrantForUrl, {
      downloadToken: blankGrant,
      accessKey: " ",
    });

    expect(blankAccess).toEqual({ status: "access_denied" });

    const wrongGrant = await insertDownloadGrant(t, {
      storageId: accessStorage,
      maxUses: null,
      useCount: 0,
    });

    const wrongAccess = await t.mutation(api.download.consumeDownloadGrantForUrl, {
      downloadToken: wrongGrant,
      accessKey: "wrong",
    });

    expect(wrongAccess).toEqual({ status: "access_denied" });

    const { storageId: passwordStorage } = await createRegisteredFile(t, {
      accessKeys: ["pw"],
    });
    const passwordGrant = await t.mutation(api.download.createDownloadGrant, {
      storageId: passwordStorage,
      password: "secret",
    });

    const passwordNoAccess = await t.mutation(
      api.download.consumeDownloadGrantForUrl,
      {
        downloadToken: passwordGrant.downloadToken,
        accessKey: " ",
        password: "wrong",
      },
    );

    expect(passwordNoAccess).toEqual({ status: "access_denied" });

    const missingPassword = await t.mutation(
      api.download.consumeDownloadGrantForUrl,
      {
        downloadToken: passwordGrant.downloadToken,
        accessKey: "pw",
      },
    );

    expect(missingPassword).toEqual({ status: "password_required" });

    const invalidPassword = await t.mutation(
      api.download.consumeDownloadGrantForUrl,
      {
        downloadToken: passwordGrant.downloadToken,
        accessKey: "pw",
        password: "wrong",
      },
    );

    expect(invalidPassword).toEqual({ status: "invalid_password" });

    const okPassword = await t.mutation(api.download.consumeDownloadGrantForUrl, {
      downloadToken: passwordGrant.downloadToken,
      accessKey: "pw",
      password: "secret",
    });

    expect(okPassword.status).toBe("ok");
    expect(okPassword.downloadUrl).toBeTypeOf("string");

    vi.useFakeTimers();
    vi.setSystemTime(new Date());
    const expiredNow = Date.now();
    const { storageId: expiredFileStorage } = await createStorageFile(
      t,
      "expired-file",
    );
    const expiredFileId = await insertFileRecord(
      t,
      expiredFileStorage,
      expiredNow - 1,
    );
    await insertFileAccess(t, expiredFileId, expiredFileStorage, "expired-key");
    const expiredFileGrant = await insertDownloadGrant(t, {
      storageId: expiredFileStorage,
      maxUses: null,
      useCount: 0,
    });

    const expiredFile = await t.mutation(api.download.consumeDownloadGrantForUrl, {
      downloadToken: expiredFileGrant,
      accessKey: "expired-key",
    });

    expect(expiredFile).toEqual({ status: "file_expired" });
    vi.runAllTimers();
    await t.finishInProgressScheduledFunctions();
    vi.useRealTimers();

    const { storageId: okStorage } = await createRegisteredFile(t, {
      accessKeys: ["ok"],
    });
    const okGrant = await insertDownloadGrant(t, {
      storageId: okStorage,
      maxUses: 2,
      useCount: 0,
    });

    const okResult = await t.mutation(api.download.consumeDownloadGrantForUrl, {
      downloadToken: okGrant,
      accessKey: "ok",
    });

    expect(okResult.status).toBe("ok");
    expect(okResult.downloadUrl).toBeTypeOf("string");

    const okGrantAfter = await t.run(async (ctx) => {
      return await ctx.db.get("downloadGrants", okGrant);
    });

    expect(okGrantAfter?.useCount).toBe(1);

    const { storageId: deleteStorage } = await createRegisteredFile(t, {
      accessKeys: ["delete"],
    });
    const deleteGrant = await insertDownloadGrant(t, {
      storageId: deleteStorage,
      maxUses: 1,
      useCount: 0,
    });

    const deleteResult = await t.mutation(api.download.consumeDownloadGrantForUrl, {
      downloadToken: deleteGrant,
      accessKey: "delete",
    });

    expect(deleteResult.status).toBe("ok");

    const deleteGrantAfter = await t.run(async (ctx) => {
      return await ctx.db.get("downloadGrants", deleteGrant);
    });

    expect(deleteGrantAfter).toBeNull();

    const { storageId: missingBlobStorage } = await createRegisteredFile(t, {
      accessKeys: ["blob"],
    });
    const missingBlobGrant = await insertDownloadGrant(t, {
      storageId: missingBlobStorage,
      maxUses: null,
      useCount: 0,
    });

    await t.run(async (ctx) => {
      await ctx.storage.delete(missingBlobStorage);
    });

    const missingBlob = await t.mutation(api.download.consumeDownloadGrantForUrl, {
      downloadToken: missingBlobGrant,
      accessKey: "blob",
    });

    expect(missingBlob).toEqual({ status: "file_missing" });

    const missingBlobGrantAfter = await t.run(async (ctx) => {
      return await ctx.db.get("downloadGrants", missingBlobGrant);
    });

    expect(missingBlobGrantAfter).not.toBeNull();
    expect(missingBlobGrantAfter?.useCount).toBe(0);
  });
});

describe("cleanUp", () => {
  test("deleteFileCascade removes records", async () => {
    const t = initConvexTest();
    const { storageId: missingFileId } = await createStorageFile(t, "missing");

    await t.run(async (ctx) => {
      await deleteFileCascade(ctx, missingFileId);
    });

    const stillThere = await t.run(async (ctx) => {
      return await ctx.storage.getUrl(missingFileId);
    });

    expect(stillThere).toBeTypeOf("string");

    const { storageId } = await createStorageFile(t, "cascade");
    const cascadeFileId = await insertFileRecord(t, storageId);
    await insertFileAccess(t, cascadeFileId, storageId, "a");
    await insertDownloadGrant(t, {
      storageId,
      maxUses: null,
      useCount: 0,
    });

    await t.run(async (ctx) => {
      await deleteFileCascade(ctx, storageId);
    });

    const fileAfter = await t.run(async (ctx) => {
      return await ctx.db
        .query("files")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .first();
    });

    expect(fileAfter).toBeNull();

    const accessAfter = await t.run(async (ctx) => {
      return await ctx.db
        .query("fileAccess")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .collect();
    });

    expect(accessAfter).toHaveLength(0);

    const grantsAfter = await t.run(async (ctx) => {
      return await ctx.db
        .query("downloadGrants")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .collect();
    });

    expect(grantsAfter).toHaveLength(0);

    const { storageId: deleteMissing } = await createStorageFile(t, "delete");
    const notDeleted = await t.mutation(api.cleanUp.deleteFile, {
      storageId: deleteMissing,
    });

    expect(notDeleted).toEqual({ deleted: false });

    const { storageId: deleteExisting } = await createStorageFile(
      t,
      "delete-existing",
    );
    await t.mutation(api.upload.registerFile, {
      storageId: deleteExisting,
      storageProvider: "convex",
      accessKeys: ["k"],
    });

    const deleted = await t.mutation(api.cleanUp.deleteFile, {
      storageId: deleteExisting,
    });

    expect(deleted).toEqual({ deleted: true });
  });

  test("cleanupExpired deletes expired records", async () => {
    const t = initConvexTest();
    vi.useFakeTimers();
    vi.setSystemTime(new Date());
    const now = Date.now();

    const { storageId: expiredFileStorage } = await createStorageFile(
      t,
      "expired-file",
    );
    const expiredFileId = await insertFileRecord(
      t,
      expiredFileStorage,
      now - 1000,
    );
    await insertFileAccess(t, expiredFileId, expiredFileStorage, "exp");
    await insertDownloadGrant(t, {
      storageId: expiredFileStorage,
      maxUses: null,
      useCount: 0,
    });

    await insertPendingUpload(t, now - 1000);
    await insertPendingUpload(t, now - 2000);

    const { storageId: expiredGrantStorage } = await createStorageFile(
      t,
      "expired-grant",
    );
    const expiredGrant = await insertDownloadGrant(t, {
      storageId: expiredGrantStorage,
      expiresAt: now - 1000,
      maxUses: null,
      useCount: 0,
    });

    const result = await t.mutation(api.cleanUp.cleanupExpired, { limit: 1 });

    expect(result.deletedCount).toBe(3);
    expect(result.hasMore).toBe(true);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();

    const expiredGrantAfter = await t.run(async (ctx) => {
      return await ctx.db.get("downloadGrants", expiredGrant);
    });

    expect(expiredGrantAfter).toBeNull();

    const expiredFileAfter = await t.run(async (ctx) => {
      return await ctx.db
        .query("files")
        .withIndex("by_storageId", (q) => q.eq("storageId", expiredFileStorage))
        .first();
    });

    expect(expiredFileAfter).toBeNull();

    const defaultLimit = await t.mutation(api.cleanUp.cleanupExpired, {});
    expect(defaultLimit).toEqual({ deletedCount: 0, hasMore: false });
  });
});

describe("queries", () => {
  test("listFilesPage and getFile return normalized data", async () => {
    const t = initConvexTest();
    const { storageId: fileA } = await createRegisteredFile(t, {
      accessKeys: ["alpha"],
    });
    const future = Date.now() + 60_000;
    const { storageId: fileB } = await createRegisteredFile(t, {
      accessKeys: ["beta"],
      expiresAt: future,
    });

    const filesResult = await t.query(api.queries.listFilesPage, {
      paginationOpts: defaultPaginationOpts,
    });
    const byStorageId = new Map(
      filesResult.page.map((file) => [file.storageId, file]),
    );

    expect(byStorageId.get(fileA)?.expiresAt).toBeNull();
    expect(byStorageId.get(fileB)?.expiresAt).toBe(future);

    const found = await t.query(api.queries.getFile, { storageId: fileA });
    expect(found?.storageId).toBe(fileA);

    const { storageId: missingFile } = await createStorageFile(t, "missing");
    const missing = await t.query(api.queries.getFile, {
      storageId: missingFile,
    });
    expect(missing).toBeNull();
  });

  test("access key queries filter correctly", async () => {
    const t = initConvexTest();
    const { storageId: fileA } = await createRegisteredFile(t, {
      accessKeys: ["access"],
    });

    const { storageId: orphanStorage } = await createStorageFile(t, "orphan");
    const orphanFileId = await insertFileRecord(t, orphanStorage);
    await insertFileAccess(t, orphanFileId, orphanStorage, "access");
    await t.run(async (ctx) => {
      await ctx.db.delete(orphanFileId);
    });

    const empty = await t.query(api.queries.listFilesByAccessKeyPage, {
      accessKey: " ",
      paginationOpts: defaultPaginationOpts,
    });

    expect(empty.page).toEqual([]);

    const files = await t.query(api.queries.listFilesByAccessKeyPage, {
      accessKey: "access",
      paginationOpts: defaultPaginationOpts,
    });

    expect(files.page).toHaveLength(1);
    expect(files.page[0]?.storageId).toBe(fileA);

    const keys = await t.query(api.queries.listAccessKeysPage, {
      storageId: fileA,
      paginationOpts: defaultPaginationOpts,
    });

    expect(keys.page.sort()).toEqual(["access"]);

    const hasAccess = await t.query(api.queries.hasAccessKey, {
      storageId: fileA,
      accessKey: "access",
    });

    expect(hasAccess).toBe(true);

    const missingAccess = await t.query(api.queries.hasAccessKey, {
      storageId: fileA,
      accessKey: " ",
    });

    expect(missingAccess).toBe(false);
  });

  test("listDownloadGrantsPage returns grant details", async () => {
    const t = initConvexTest();
    const { storageId } = await createRegisteredFile(t, {
      accessKeys: ["grant"],
    });

    const grantId: DownloadGrantId = await insertDownloadGrant(t, {
      storageId,
      maxUses: 2,
      useCount: 0,
    });
    const nullGrantId: DownloadGrantId = await insertDownloadGrant(t, {
      storageId,
      maxUses: null,
      useCount: 0,
    });

    const grants = await t.query(api.queries.listDownloadGrantsPage, {
      paginationOpts: defaultPaginationOpts,
    });
    const grant = grants.page.find((item) => item._id === grantId);
    const nullGrant = grants.page.find((item) => item._id === nullGrantId);

    expect(grant?.storageId).toBe(storageId);
    expect(grant?.maxUses).toBe(2);
    expect(grant?.useCount).toBe(0);
    expect(nullGrant?.maxUses).toBeNull();
  });
});
