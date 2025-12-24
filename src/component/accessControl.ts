import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { findFileByStorageId, normalizeAccessKeys } from "./lib";

/**
 * Adds an access key to an existing file.
 *
 * @param args.storageId - The storage ID of the file
 * @param args.accessKey - The access key to add
 *
 * @returns The added access key
 * @throws Error if the file is not found or access key already exists
 */
export const addAccessKey = mutation({
  args: {
    storageId: v.id("_storage"),
    accessKey: v.string(),
  },
  returns: v.object({
    accessKey: v.string(),
  }),
  handler: async (ctx, args) => {
    const [accessKey] = normalizeAccessKeys([args.accessKey]);
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
      storageId: args.storageId,
      accessKey,
    });

    return { accessKey };
  },
});

/**
 * Removes an access key from a file.
 *
 * @param args.storageId - The storage ID of the file
 * @param args.accessKey - The access key to remove
 *
 * @returns Success status
 * @throws Error if the file is not found or access key doesn't exist
 */
export const removeAccessKey = mutation({
  args: {
    storageId: v.id("_storage"),
    accessKey: v.string(),
  },
  returns: v.object({
    removed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const [accessKey] = normalizeAccessKeys([args.accessKey]);
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
 * Updates the expiration date of a file.
 *
 * @param args.storageId - The storage ID of the file
 * @param args.expiresAt - New expiration timestamp (null for never expires)
 *
 * @returns The updated expiration date
 * @throws Error if the file is not found or expiresAt is in the past
 */
export const updateFileExpiration = mutation({
  args: {
    storageId: v.id("_storage"),
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
