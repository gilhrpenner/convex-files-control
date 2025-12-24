import { v } from "convex/values";
import { query } from "./_generated/server";
import { hasAccessKey as hasAccessKeyForFile, normalizeAccessKeys } from "./lib";

/**
 * Lists all registered files.
 *
 * @returns List of files with their metadata
 */
export const listFiles = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("files"),
      storageId: v.id("_storage"),
      expiresAt: v.union(v.number(), v.null()),
    })
  ),
  handler: async (ctx) => {
    const files = await ctx.db.query("files").order("desc").collect();
    return files.map((file) => ({
      _id: file._id,
      storageId: file.storageId,
      expiresAt: file.expiresAt ?? null,
    }));
  },
});

/**
 * Lists all files accessible by a specific access key.
 *
 * @param args.accessKey - The access key to filter by
 *
 * @returns List of files accessible by the given access key
 */
export const listFilesByAccessKey = query({
  args: {
    accessKey: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id("files"),
      storageId: v.id("_storage"),
      expiresAt: v.union(v.number(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const [accessKey] = normalizeAccessKeys([args.accessKey]);
    if (!accessKey) {
      return [];
    }

    const accessRecords = await ctx.db
      .query("fileAccess")
      .withIndex("by_accessKey", (q) => q.eq("accessKey", accessKey))
      .collect();

    const storageIds = [...new Set(accessRecords.map((access) => access.storageId))];
    const files = await Promise.all(
      storageIds.map((storageId) =>
        ctx.db
          .query("files")
          .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
          .first()
      )
    );

    const validFiles = files.filter(
      (f): f is NonNullable<typeof f> => f != null,
    );

    return validFiles.map((file) => ({
      _id: file._id,
      storageId: file.storageId,
      expiresAt: file.expiresAt ?? null,
    }));
  },
});

/**
 * Gets a single file's details by its storage ID.
 *
 * @param args.storageId - The storage ID of the file
 *
 * @returns The file details, or null if not found
 */
export const getFile = query({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.union(
    v.object({
      _id: v.id("files"),
      storageId: v.id("_storage"),
      expiresAt: v.union(v.number(), v.null()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const file = await ctx.db
      .query("files")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();

    if (!file) {
      return null;
    }

    return {
      _id: file._id,
      storageId: file.storageId,
      expiresAt: file.expiresAt ?? null,
    };
  },
});

/**
 * Lists all access keys for a given file.
 *
 * @param args.storageId - The storage ID of the file
 *
 * @returns Array of access keys that grant access to this file
 */
export const listAccessKeys = query({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const accessRecords = await ctx.db
      .query("fileAccess")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .collect();

    return accessRecords.map((record) => record.accessKey);
  },
});

/**
 * Lists all download grants.
 *
 * @returns List of download grants with usage and expiration info
 */
export const listDownloadGrants = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("downloadGrants"),
      storageId: v.id("_storage"),
      expiresAt: v.union(v.number(), v.null()),
      maxUses: v.union(v.null(), v.number()),
      useCount: v.number(),
    })
  ),
  handler: async (ctx) => {
    const grants = await ctx.db.query("downloadGrants").order("desc").collect();
    return grants.map((grant) => ({
      _id: grant._id,
      storageId: grant.storageId,
      expiresAt: grant.expiresAt ?? null,
      maxUses: grant.maxUses ?? null,
      useCount: grant.useCount,
    }));
  },
});

/**
 * Checks whether an access key grants access to a file.
 *
 * @param args.storageId - The storage ID of the file
 * @param args.accessKey - The access key to verify
 *
 * @returns True if the access key grants access
 */
export const hasAccessKey = query({
  args: {
    storageId: v.id("_storage"),
    accessKey: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return hasAccessKeyForFile(ctx, args);
  },
});
