import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { api, components } from "./_generated/api.js";
import { action, internalMutation, mutation, query, type MutationCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.js";
import { getR2ConfigFromEnv } from "./r2Config.js";

/** Demo limits - in production you have full control over these */
const DEMO_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const DEMO_MAX_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Enforce demo expiration limits:
 * - If no expiration set, default to 24hrs
 * - If expiration > 24hrs from now, cap it to 24hrs
 * - If expiration <= 24hrs, leave as is
 */
function enforceDemoExpiration(expiresAt: number | null | undefined): number {
  const now = Date.now();
  const maxExpiry = now + DEMO_MAX_EXPIRATION_MS;
  
  if (expiresAt == null) {
    return maxExpiry;
  }
  
  return expiresAt > maxExpiry ? maxExpiry : expiresAt;
}

async function insertUploadRecord(
  ctx: MutationCtx,
  args: { storageId: string;
  storageProvider: "convex" | "r2";
  fileName: string;
  expiresAt: number | null;
  metadata: {
    storageId: string;
    size: number;
    sha256: string;
    contentType: string | null;
  } | null;
  userId: Id<"users"> },
) {
  await ctx.db.insert("filesUploads", {
    storageId: args.storageId,
    storageProvider: args.storageProvider,
    userId: args.userId,
    fileName: args.fileName,
    expiresAt: args.expiresAt,
    metadata: args.metadata,
  });
}

export const generateUploadUrl = mutation({
  args: {
    provider: v.union(v.literal("convex"), v.literal("r2")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("User is not authenticated.");
    }

    /**
     * R2 is optional, if you have no plans to use it, you can skip this and
     * remove the `r2Config` argument from the `generateUploadUrl` mutation.
     */
    const r2Config = getR2ConfigFromEnv();
    if (args.provider === "r2" && !r2Config) {
      throw new ConvexError("R2 configuration is missing.");
    }

    return await ctx.runMutation(
      components.convexFilesControl.upload.generateUploadUrl,
      {
        provider: args.provider,
        r2Config: r2Config ?? undefined,
      },
    );
  },
});

export const finalizeUpload = mutation({
  args: {
    uploadToken: v.string(),
    storageId: v.string(),
    fileName: v.string(),
    expiresAt: v.optional(v.union(v.null(), v.number())),
    metadata: v.optional(
      v.object({
        size: v.number(),
        sha256: v.string(),
        contentType: v.union(v.string(), v.null()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("User is not authenticated.");
    }

    // Demo limit: Check file size (5MB max)
    if (args.metadata?.size && args.metadata.size > DEMO_MAX_FILE_SIZE_BYTES) {
      throw new ConvexError(
        `Demo limit: File size exceeds 5MB. Your file is ${(args.metadata.size / (1024 * 1024)).toFixed(2)}MB.`
      );
    }

    // Extract fileName before passing to component (component doesn't accept it)
    const { fileName: _fileName, ...componentArgs } = args;

    // Demo limit: Enforce 24hr max expiration
    const enforcedExpiresAt = enforceDemoExpiration(componentArgs.expiresAt);

    const result = await ctx.runMutation(
      components.convexFilesControl.upload.finalizeUpload,
      {
        /**
         * If you want to allow multiple users to access the file or even allow
         * to all users of a given tenant, you can pass the them here.
         */
        accessKeys: [userId],
        ...componentArgs,
        expiresAt: enforcedExpiresAt,
      },
    );

    await insertUploadRecord(ctx, {
      userId,
      storageId: result.storageId,
      storageProvider: result.storageProvider,
      fileName: args.fileName,
      expiresAt: result.expiresAt,
      metadata: result.metadata,
    });

    return result;
  },
});

export const recordUpload = mutation({
  args: {
    storageId: v.string(),
    storageProvider: v.union(v.literal("convex"), v.literal("r2")),
    fileName: v.string(),
    expiresAt: v.union(v.null(), v.number()),
    metadata: v.union(
      v.object({
        storageId: v.string(),
        size: v.number(),
        sha256: v.string(),
        contentType: v.union(v.string(), v.null()),
      }),
      v.null(),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("User is not authenticated.");
    }

    await insertUploadRecord(ctx, { userId, ...args });
  },
});

/**
 * Query to list all files uploaded by the current authenticated user.
 * Returns an empty array if the user is not authenticated.
 */
export const listUserUploads = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }
    return await ctx.db
      .query("filesUploads")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const deleteFile = mutation({
  args: {
    _id: v.id("filesUploads"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("User is not authenticated.");
    }

    const file = await ctx.db.get("filesUploads", args._id);
    if (!file) {
      throw new ConvexError("File not found.");
    }
    if (file.userId !== userId) {
      throw new ConvexError("You do not have permission to delete this file.");
    }

    await ctx.db.delete("filesUploads", args._id);

    // Delete from the component's database and storage provider
    const r2Config = getR2ConfigFromEnv();
    await ctx.runMutation(
      components.convexFilesControl.cleanUp.deleteFile,
      {
        storageId: file.storageId,
        r2Config: r2Config ?? undefined,
      },
    );
  },
});

/**
 * Generate a single-use download URL for a file.
 * Creates a download grant with maxUses: 1 and immediately consumes it.
 */
export const getFileDownloadUrl = mutation({
  args: {
    _id: v.id("filesUploads"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("User is not authenticated.");
    }

    const file = await ctx.db.get("filesUploads", args._id);
    if (!file) {
      throw new ConvexError("File not found.");
    }
    if (file.userId !== userId) {
      throw new ConvexError("You do not have permission to download this file.");
    }

    // Create a single-use download grant
    const grant = await ctx.runMutation(
      components.convexFilesControl.download.createDownloadGrant,
      {
        storageId: file.storageId,
        maxUses: 1,
      },
    );

    // Consume it immediately to get the download URL
    const r2Config = getR2ConfigFromEnv();
    const result = await ctx.runMutation(
      components.convexFilesControl.download.consumeDownloadGrantForUrl,
      {
        downloadToken: grant.downloadToken,
        accessKey: userId,
        r2Config: r2Config ?? undefined,
      },
    );

    if (result.status !== "ok" || !result.downloadUrl) {
      throw new ConvexError(`Download failed: ${result.status}`);
    }

    return {
      downloadUrl: result.downloadUrl,
      fileName: file.fileName,
    };
  },
});

/**
 * Create a shareable download link for a file.
 * Unlike regular download grants, shareable links can be consumed by
 * unauthenticated users (no accessKey required).
 */
export const createShareableLink = mutation({
  args: {
    _id: v.id("filesUploads"),
    expiresAt: v.optional(v.number()),
    maxUses: v.optional(v.number()),
    password: v.optional(v.string()),
    public: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("User is not authenticated.");
    }

    const file = await ctx.db.get("filesUploads", args._id);
    if (!file) {
      throw new ConvexError("File not found.");
    }
    if (file.userId !== userId) {
      throw new ConvexError("You do not have permission to share this file.");
    }

    const grant = await ctx.runMutation(
      components.convexFilesControl.download.createDownloadGrant,
      {
        storageId: file.storageId,
        shareableLink: args.public ?? false,
        maxUses: args.maxUses ?? null,
        expiresAt: args.expiresAt,
        password: args.password,
      },
    );

    return {
      downloadToken: grant.downloadToken,
      expiresAt: grant.expiresAt,
      maxUses: grant.maxUses,
    };
  },
});

/**
 * Transfer a file between storage providers (Convex ↔ R2).
 *
 * This action moves the file's data from one storage backend to another while
 * preserving all access keys and download grants. The original file is deleted
 * after successful transfer.
 *
 * Use cases:
 * - Cost optimization: Move cold files to cheaper storage
 * - Migration: Move all files from one provider to another
 */
export const transferFile = action({
  args: {
    _id: v.id("filesUploads"),
    targetProvider: v.union(v.literal("convex"), v.literal("r2")),
  },
  returns: v.object({
    storageId: v.string(),
    storageProvider: v.union(v.literal("convex"), v.literal("r2")),
  }),
  handler: async (ctx, args): Promise<{
    storageId: string;
    storageProvider: "convex" | "r2";
  }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("User is not authenticated.");
    }

    const file = await ctx.runQuery(api.files.getUploadById, { _id: args._id });
    if (!file) {
      throw new ConvexError("File not found.");
    }
    if (file.userId !== userId) {
      throw new ConvexError("You do not have permission to transfer this file.");
    }

    const r2Config = getR2ConfigFromEnv();
    if (args.targetProvider === "r2" && !r2Config) {
      throw new ConvexError("R2 configuration is missing.");
    }

    // Call the component's transfer action
    const result = await ctx.runAction(
      components.convexFilesControl.transfer.transferFile,
      {
        storageId: file.storageId,
        targetProvider: args.targetProvider,
        r2Config: r2Config ?? undefined,
      },
    );

    // Update our local record with the new storage info
    await ctx.runMutation(api.files.updateUploadStorageInfo, {
      _id: args._id,
      storageId: result.storageId,
      storageProvider: result.storageProvider,
    });

    return result;
  },
});

/**
 * Internal query to get an upload by ID.
 */
export const getUploadById = query({
  args: {
    _id: v.id("filesUploads"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get("filesUploads", args._id);
  },
});

/**
 * Internal mutation to update storage info after transfer.
 */
export const updateUploadStorageInfo = mutation({
  args: {
    _id: v.id("filesUploads"),
    storageId: v.string(),
    storageProvider: v.union(v.literal("convex"), v.literal("r2")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("User is not authenticated.");
    }

    const file = await ctx.db.get("filesUploads", args._id);
    if (!file) {
      throw new ConvexError("File not found.");
    }
    if (file.userId !== userId) {
      throw new ConvexError("You do not have permission to update this file.");
    }

    await ctx.db.patch("filesUploads", args._id, {
      storageId: args.storageId,
      storageProvider: args.storageProvider,
    });
  },
});

/**
 * Add an access key to a file, enabling access for another user or tenant.
 *
 * Use cases:
 * - Share a file with another user
 * - Grant access to a team/organization
 * - Implement role-based access patterns
 */
export const addAccessKey = mutation({
  args: {
    _id: v.id("filesUploads"),
    accessKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("User is not authenticated.");
    }

    const file = await ctx.db.get("filesUploads", args._id);
    if (!file) {
      throw new ConvexError("File not found.");
    }
    if (file.userId !== userId) {
      throw new ConvexError("You do not have permission to share this file.");
    }

    return await ctx.runMutation(
      components.convexFilesControl.accessControl.addAccessKey,
      {
        storageId: file.storageId,
        accessKey: args.accessKey,
      },
    );
  },
});

/**
 * Remove an access key from a file, revoking access for a user or tenant.
 *
 * Note: The last access key cannot be removed to prevent orphaning the file.
 */
export const removeAccessKey = mutation({
  args: {
    _id: v.id("filesUploads"),
    accessKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("User is not authenticated.");
    }

    const file = await ctx.db.get("filesUploads", args._id);
    if (!file) {
      throw new ConvexError("File not found.");
    }
    if (file.userId !== userId) {
      throw new ConvexError("You do not have permission to modify this file.");
    }

    return await ctx.runMutation(
      components.convexFilesControl.accessControl.removeAccessKey,
      {
        storageId: file.storageId,
        accessKey: args.accessKey,
      },
    );
  },
});

/**
 * Update the expiration date of a file.
 *
 * Pass `null` to remove the expiration (file never expires).
 * Pass a future timestamp to set when the file should be deleted.
 */
export const updateFileExpiration = mutation({
  args: {
    _id: v.id("filesUploads"),
    expiresAt: v.union(v.null(), v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("User is not authenticated.");
    }

    const file = await ctx.db.get("filesUploads", args._id);
    if (!file) {
      throw new ConvexError("File not found.");
    }
    if (file.userId !== userId) {
      throw new ConvexError("You do not have permission to modify this file.");
    }

    // Update in the component
    const result = await ctx.runMutation(
      components.convexFilesControl.accessControl.updateFileExpiration,
      {
        storageId: file.storageId,
        expiresAt: args.expiresAt,
      },
    );

    // Update our local record too
    await ctx.db.patch("filesUploads", args._id, {
      expiresAt: args.expiresAt,
    });

    return result;
  },
});

/**
 * List all access keys for a file.
 */
export const listAccessKeys = query({
  args: {
    _id: v.id("filesUploads"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    const file = await ctx.db.get("filesUploads", args._id);
    if (!file) {
      return [];
    }
    if (file.userId !== userId) {
      return [];
    }

    const result = await ctx.runQuery(
      components.convexFilesControl.queries.listAccessKeysPage,
      {
        storageId: file.storageId,
        paginationOpts: { numItems: 100, cursor: null },
      },
    );

    return result.page;
  },
});

/**
 * List all files in the system (admin view).
 *
 * This exposes the component's file listing capability with pagination.
 * Returns an empty result if the user is not authenticated.
 * In a real app, you'd want to add admin authorization here.
 */
export const listAllFiles = query({
  args: {
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return {
        page: [],
        continueCursor: null,
        isDone: true,
      };
    }

    // In production, add admin role check here
    // if (!isAdmin(userId)) throw new ConvexError("Admin access required.");

    return await ctx.runQuery(
      components.convexFilesControl.queries.listFilesPage,
      {
        paginationOpts: args.paginationOpts,
      },
    );
  },
});

/**
 * List all download grants in the system (admin view).
 *
 * Shows all active and expired grants with their status, uses, and expiry.
 * Returns an empty result if the user is not authenticated.
 */
export const listDownloadGrants = query({
  args: {
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return {
        page: [],
        continueCursor: null,
        isDone: true,
      };
    }

    // In production, add admin role check here

    return await ctx.runQuery(
      components.convexFilesControl.queries.listDownloadGrantsPage,
      {
        paginationOpts: args.paginationOpts,
      },
    );
  },
});

/**
 * Get detailed information about a file by its storage ID.
 */
export const getFileDetails = query({
  args: {
    storageId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("User is not authenticated.");
    }

    // In production, add admin role check here

    return await ctx.runQuery(components.convexFilesControl.queries.getFile, {
      storageId: args.storageId,
    });
  },
});

/**
 * Internal mutation called by the cron job to cleanup expired files.
 *
 * This wraps the component's cleanupExpired mutation since cron jobs
 * cannot directly call component functions.
 */
export const cleanupExpiredFiles = internalMutation({
  args: {},
  handler: async (ctx) => {
    const r2Config = getR2ConfigFromEnv();
    return await ctx.runMutation(
      components.convexFilesControl.cleanUp.cleanupExpired,
      {
        limit: 500,
        r2Config: r2Config ?? undefined,
      },
    );
  },
});
