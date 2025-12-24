import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { findFileByStorageId } from "./lib";

async function deleteFileCascadeCore(ctx: MutationCtx, file: Doc<"files">) {
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
    ctx.storage.delete(storageId),
    ...accessRows.map((row) => ctx.db.delete(row._id)),
    ...grants.map((grant) => ctx.db.delete(grant._id)),
  ]);
}

/**
 * Deletes a file and all associated records in a cascade operation.
 * Deletes file access records, download grants, the file record itself, and the storage file.
 *
 * @param ctx - The mutation context
 * @param storageId - The storage ID of the file to delete
 *
 * @returns void (no-op if file doesn't exist)
 */
export async function deleteFileCascade(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
) {
  const file = await findFileByStorageId(ctx, storageId);
  if (!file) {
    return;
  }

  await deleteFileCascadeCore(ctx, file);
}

/**
 * Deletes a file and all associated records.
 * This is the public mutation that wraps deleteFileCascade.
 *
 * @param args.storageId - The storage ID of the file to delete
 *
 * @returns Success status and whether the file existed
 */
export const deleteFile = mutation({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.object({
    deleted: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const file = await findFileByStorageId(ctx, args.storageId);
    if (!file) {
      return { deleted: false };
    }
    await deleteFileCascadeCore(ctx, file);
    return { deleted: true };
  },
});

async function cleanupExpiredCore(
  ctx: MutationCtx,
  args: { limit?: number },
) {
  const now = Date.now();
  const limit = args.limit ?? 500;

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
    ...expiredFiles.map((f) => deleteFileCascadeCore(ctx, f)),
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
    });
  }

  return { deletedCount, hasMore };
}

/**
 * Cleans up expired records (pending uploads, download grants, and files).
 * Deletes expired records up to the specified limit per type (default: 500).
 * Files are deleted with cascade (including associated access keys and grants).
 *
 * @param args.limit - Maximum number of expired records to delete per type (default: 500)
 *
 * @returns An object with total deleted count and whether more work remains.
 */
export const cleanupExpired = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    deletedCount: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    return cleanupExpiredCore(ctx, args);
  },
});

/**
 * Internal mutation for recursive cleanup.
 * Same as cleanupExpired but callable via scheduler.runAfter.
 */
export const cleanupExpiredInternal = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    deletedCount: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    return cleanupExpiredCore(ctx, args);
  },
});
