import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { api, components, internal } from "./_generated/api";
import { findFileByStorageId, toStorageId } from "./lib";
import { DEFAULT_CLEANUP_LIMIT } from "./constants";
import { ActionRetrier } from "@convex-dev/action-retrier";
import { storageProviderValidator } from "./storageProvider";
import { deleteR2Object, r2ConfigValidator, requireR2Config } from "./r2";

const retrier = new ActionRetrier(components.actionRetrier);

const useActionRetrier =
  typeof process === "undefined" ||
  (!process.env.VITEST && process.env.NODE_ENV !== "test");

/**
 * Delete a storage object by ID.
 *
 * This action exists to allow retries via the action retrier.
 *
 * @param args.storageId - The storage ID to delete.
 * @returns `null`.
 *
 * @example
 * ```ts
 * await ctx.runAction(components.convexFilesControl.cleanUp.deleteStorageFile, {
 *   storageId,
 * });
 * ```
 */
export const deleteStorageFile = action({
  args: {
    storageId: v.string(),
    storageProvider: storageProviderValidator,
    r2Config: v.optional(r2ConfigValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.storageProvider === "convex") {
      await ctx.storage.delete(toStorageId(args.storageId));
      return null;
    }

    const r2Config = requireR2Config(args.r2Config, "R2 deletes");
    await deleteR2Object(r2Config, args.storageId);
    return null;
  },
});

async function deleteStorageFileWithRetry(
  ctx: MutationCtx,
  args: {
    storageId: string;
    storageProvider: "convex" | "r2";
    r2Config?: {
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucketName: string;
    };
  },
) {
  if (!useActionRetrier) {
    if (args.storageProvider === "convex") {
      await ctx.storage.delete(toStorageId(args.storageId));
      return;
    }
    const r2Config = requireR2Config(args.r2Config, "R2 deletes");
    await deleteR2Object(r2Config, args.storageId);
    return;
  }

  await retrier.run(ctx, api.cleanUp.deleteStorageFile, args);
}

async function deleteFileCascadeCore(
  ctx: MutationCtx,
  file: Doc<"files">,
  r2Config?: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
  },
) {
  const storageId = file.storageId;
  const [accessRows, grants] = await Promise.all([
    ctx.db
      .query("fileAccess")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .collect(),
    ctx.db
      .query("downloadGrants")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .collect(),
  ]);

  await Promise.all([
    ctx.db.delete(file._id),
    deleteStorageFileWithRetry(ctx, {
      storageId,
      storageProvider: file.storageProvider,
      r2Config,
    }),
    ...accessRows.map((row) => ctx.db.delete(row._id)),
    ...grants.map((grant) => ctx.db.delete(grant._id)),
  ]);
}

export async function deleteFileCascade(
  ctx: MutationCtx,
  storageId: string,
  r2Config?: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
  },
) {
  const file = await findFileByStorageId(ctx, storageId);
  if (!file) {
    return;
  }

  await deleteFileCascadeCore(ctx, file, r2Config);
}

/**
 * Delete a file and all associated records.
 *
 * Removes access key mappings, download grants, and the storage object.
 *
 * @param args.storageId - The file's storage ID.
 * @returns `{ deleted: true }` if the file existed and was removed.
 *
 * @example
 * ```ts
 * await ctx.runMutation(components.convexFilesControl.cleanUp.deleteFile, {
 *   storageId,
 * });
 * ```
 */
export const deleteFile = mutation({
  args: {
    storageId: v.string(),
    r2Config: v.optional(r2ConfigValidator),
  },
  returns: v.object({
    deleted: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const file = await findFileByStorageId(ctx, args.storageId);
    if (!file) {
      return { deleted: false };
    }

    await deleteFileCascadeCore(ctx, file, args.r2Config);
    return { deleted: true };
  },
});

async function cleanupExpiredCore(
  ctx: MutationCtx,
  args: {
    limit?: number;
    r2Config?: {
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucketName: string;
    };
  },
) {
  const now = Date.now();
  const limit = args.limit ?? DEFAULT_CLEANUP_LIMIT;

  const [expiredUploads, expiredGrants, expiredFiles] = await Promise.all([
    ctx.db
      .query("pendingUploads")
      .withIndex("by_expiresAt", (q) => q.gt("expiresAt", 0).lte("expiresAt", now))
      .take(limit),
    ctx.db
      .query("downloadGrants")
      .withIndex("by_expiresAt", (q) => q.gt("expiresAt", 0).lte("expiresAt", now))
      .take(limit),
    ctx.db
      .query("files")
      .withIndex("by_expiresAt", (q) => q.gt("expiresAt", 0).lte("expiresAt", now))
      .take(limit),
  ]);

  await Promise.all([
    ...expiredUploads.map((u) => ctx.db.delete(u._id)),
    ...expiredGrants.map((g) => ctx.db.delete(g._id)),
    ...expiredFiles.map((f) => deleteFileCascadeCore(ctx, f, args.r2Config)),
  ]);

  const deletedCount =
    expiredUploads.length + expiredGrants.length + expiredFiles.length;
  const hasMore =
    expiredUploads.length === limit ||
    expiredGrants.length === limit ||
    expiredFiles.length === limit;

  if (hasMore) {
    await ctx.scheduler.runAfter(0, internal.cleanUp.cleanupExpiredInternal, {
      limit,
      r2Config: args.r2Config,
    });
  }

  return { deletedCount, hasMore };
}

/**
 * Purge expired pending uploads, download grants, and file records.
 *
 * Deletes up to `limit` items per table and schedules follow-up work if more
 * items remain.
 *
 * @param args.limit - Maximum number of expired records to delete per table.
 * @returns The number of deleted records and whether more work remains.
 *
 * @example
 * ```ts
 * import { cronJobs } from "convex/server";
 * import { components } from "./_generated/api";
 *
 * const crons = cronJobs();
 * crons.hourly("cleanup-files", { minuteUTC: 0 }, components.convexFilesControl.cleanUp.cleanupExpired, {
 *   limit: 500,
 * });
 * export default crons;
 * ```
 */
export const cleanupExpired = mutation({
  args: {
    limit: v.optional(v.number()),
    r2Config: v.optional(r2ConfigValidator),
  },
  returns: v.object({
    deletedCount: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    return cleanupExpiredCore(ctx, args);
  },
});

export const cleanupExpiredInternal = internalMutation({
  args: {
    limit: v.optional(v.number()),
    r2Config: v.optional(r2ConfigValidator),
  },
  returns: v.object({
    deletedCount: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    return cleanupExpiredCore(ctx, args);
  },
});
