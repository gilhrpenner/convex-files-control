import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { findFileByStorageId, normalizeAccessKey } from "./lib";

/**
 * Add an access key to a file, enabling access for a user or tenant.
 *
 * The key is normalized (trimmed). Fails if the file does not exist or the
 * key is already attached to the file.
 *
 * @param args.storageId - The file's storage ID.
 * @param args.accessKey - The access key to grant.
 * @returns The normalized access key.
 *
 * @example
 * ```ts
 * await ctx.runMutation(components.convexFilesControl.accessControl.addAccessKey, {
 *   storageId,
 *   accessKey: "user_123",
 * });
 * ```
 */
export const addAccessKey = mutation({
  args: {
    storageId: v.string(),
    accessKey: v.string(),
  },
  returns: v.object({
    accessKey: v.string(),
  }),
  handler: async (ctx, args) => {
    const accessKey = normalizeAccessKey(args.accessKey);
    if (!accessKey) {
      throw new ConvexError("Access key cannot be empty.");
    }

    const [file, existing] = await Promise.all([
      findFileByStorageId(ctx, args.storageId),
      ctx.db
        .query("fileAccess")
        .withIndex("by_accessKey_and_storageId", (q) =>
          q.eq("accessKey", accessKey).eq("storageId", args.storageId),
        )
        .first(),
    ]);

    if (!file) {
      throw new ConvexError("File not found.");
    }

    if (existing) {
      throw new ConvexError("Access key already exists for this file.");
    }

    await ctx.db.insert("fileAccess", {
      fileId: file._id,
      storageId: args.storageId,
      accessKey,
    });

    return { accessKey };
  },
});

/**
 * Remove an access key from a file.
 *
 * The final remaining access key cannot be removed to avoid orphaning access.
 *
 * @param args.storageId - The file's storage ID.
 * @param args.accessKey - The access key to revoke.
 * @returns `{ removed: true }` when the key is deleted.
 *
 * @example
 * ```ts
 * await ctx.runMutation(components.convexFilesControl.accessControl.removeAccessKey, {
 *   storageId,
 *   accessKey: "user_123",
 * });
 * ```
 */
export const removeAccessKey = mutation({
  args: {
    storageId: v.string(),
    accessKey: v.string(),
  },
  returns: v.object({
    removed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const accessKey = normalizeAccessKey(args.accessKey);
    if (!accessKey) {
      throw new ConvexError("Access key cannot be empty.");
    }

    const [file, accessRecord] = await Promise.all([
      findFileByStorageId(ctx, args.storageId),
      ctx.db
        .query("fileAccess")
        .withIndex("by_accessKey_and_storageId", (q) =>
          q.eq("accessKey", accessKey).eq("storageId", args.storageId),
        )
        .first(),
    ]);

    if (!file) {
      throw new ConvexError("File not found.");
    }

    if (!accessRecord) {
      throw new ConvexError("Access key not found for this file.");
    }

    const remainingAccess = await ctx.db
      .query("fileAccess")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .take(2);

    if (remainingAccess.length <= 1) {
      throw new ConvexError("Cannot remove the last access key from a file.");
    }

    await ctx.db.delete(accessRecord._id);

    return { removed: true };
  },
});

/**
 * Set or clear a file expiration timestamp.
 *
 * @param args.storageId - The file's storage ID.
 * @param args.expiresAt - A future timestamp or `null` to remove expiration.
 * @returns The new expiration value.
 *
 * @example
 * ```ts
 * await ctx.runMutation(components.convexFilesControl.accessControl.updateFileExpiration, {
 *   storageId,
 *   expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
 * });
 * ```
 */
export const updateFileExpiration = mutation({
  args: {
    storageId: v.string(),
    expiresAt: v.union(v.null(), v.number()),
  },
  returns: v.object({
    expiresAt: v.union(v.null(), v.number()),
  }),
  handler: async (ctx, args) => {
    const file = await findFileByStorageId(ctx, args.storageId);
    if (!file) {
      throw new ConvexError("File not found.");
    }

    if (args.expiresAt !== null && args.expiresAt <= Date.now()) {
      throw new ConvexError("Expiration must be in the future.");
    }

    await ctx.db.patch(file._id, {
      expiresAt: args.expiresAt ?? undefined,
    });

    return { expiresAt: args.expiresAt };
  },
});
