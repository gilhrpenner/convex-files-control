import { mutation, query } from "./_generated/server.js";
import { components } from "./_generated/api.js";
import { ConvexError, v } from "convex/values";
import { buildDownloadUrl } from "@gilhrpenner/convex-files-control";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.runMutation(
      components.convexFilesControl.upload.generateUploadUrl,
      {},
    );
  },
});

export const finalizeUpload = mutation({
  args: {
    uploadToken: v.string(),
    storageId: v.id("_storage"),
    accessKeys: v.array(v.string()),
    expiresAt: v.optional(v.union(v.null(), v.number())),
  },
  handler: async (ctx, args) => {
    return await ctx.runMutation(
      components.convexFilesControl.upload.finalizeUpload,
      args,
    );
  },
});

export const storeCustomFile = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    expiresAt: v.union(v.null(), v.number()),
    size: v.number(),
    sha256: v.string(),
    contentType: v.union(v.string(), v.null()),
    accessKey: v.string(),
  },
  returns: v.id("customFiles"),
  handler: async (ctx, args) => {
    const accessKey = args.accessKey.trim();
    if (!accessKey) {
      throw new ConvexError("Access key is required.");
    }

    const existing = await ctx.db
      .query("customFiles")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        fileName: args.fileName,
        expiresAt: args.expiresAt,
        size: args.size,
        sha256: args.sha256,
        contentType: args.contentType,
        accessKey,
      });
      return existing._id;
    }

    return await ctx.db.insert("customFiles", {
      storageId: args.storageId,
      fileName: args.fileName,
      expiresAt: args.expiresAt,
      size: args.size,
      sha256: args.sha256,
      contentType: args.contentType,
      accessKey,
    });
  },
});

export const listComponentFiles = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.string(),
      storageId: v.string(),
      expiresAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    return await ctx.runQuery(
      components.convexFilesControl.queries.listFiles,
      {},
    );
  },
});

export const listCustomFiles = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("customFiles"),
      storageId: v.id("_storage"),
      fileName: v.string(),
      expiresAt: v.union(v.null(), v.number()),
      size: v.number(),
      sha256: v.string(),
      contentType: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const files = await ctx.db.query("customFiles").order("desc").collect();
    return files.map((file) => ({
      _id: file._id,
      storageId: file.storageId,
      fileName: file.fileName,
      expiresAt: file.expiresAt,
      size: file.size,
      sha256: file.sha256,
      contentType: file.contentType,
    }));
  },
});

export const listDownloadGrants = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.string(),
      storageId: v.string(),
      expiresAt: v.union(v.null(), v.number()),
      maxUses: v.union(v.null(), v.number()),
      useCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    return await ctx.runQuery(
      components.convexFilesControl.queries.listDownloadGrants,
      {},
    );
  },
});

export const createDownloadUrl = mutation({
  args: {
    storageId: v.id("_storage"),
    baseUrl: v.string(),
    maxUses: v.optional(v.union(v.null(), v.number())),
    expiresAt: v.optional(v.union(v.null(), v.number())),
    filename: v.optional(v.string()),
  },
  returns: v.object({ downloadUrl: v.string() }),
  handler: async (ctx, args) => {
    let filename = args.filename?.trim() || undefined;
    if (!filename) {
      const customFile = await ctx.db
        .query("customFiles")
        .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
        .first();
      const extension = extensionFromFilename(customFile?.fileName ?? "");
      if (extension) {
        filename = `download.${extension}`;
      }
    }

    const grant = await ctx.runMutation(
      components.convexFilesControl.download.createDownloadGrant,
      {
        storageId: args.storageId,
        maxUses: args.maxUses,
        expiresAt: args.expiresAt,
      },
    );

    const downloadUrl = buildDownloadUrl({
      baseUrl: args.baseUrl,
      downloadToken: grant.downloadToken,
      filename,
    });

    return { downloadUrl };
  },
});

function extensionFromFilename(value: string) {
  const trimmed = value.trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    return "";
  }
  return trimmed.slice(lastDot + 1);
}
