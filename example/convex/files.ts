import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api.js";
import { mutation, query, type MutationCtx } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.js";
import { getR2ConfigFromEnv } from "./r2Config.js";

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

    // Extract fileName before passing to component (component doesn't accept it)
    const { fileName: _fileName, ...componentArgs } = args;

    const result = await ctx.runMutation(
      components.convexFilesControl.upload.finalizeUpload,
      {
        /**
         * If you want to allow multiple users to access the file or even allow
         * to all users of a given tenant, you can pass the them here.
         */
        accessKeys: [userId],
        ...componentArgs,
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
