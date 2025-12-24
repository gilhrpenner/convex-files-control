import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { findFileByStorageId, hasAccessKey } from "./lib";
import type { Id } from "./_generated/dataModel";
import { deleteFileCascade } from "./cleanUp";

const DEFAULT_MAX_DOWNLOAD_USES = 1;

const downloadConsumeStatusValidator = v.union(
  v.literal("ok"),
  v.literal("not_found"),
  v.literal("expired"),
  v.literal("exhausted"),
  v.literal("file_missing"),
  v.literal("file_expired"),
  v.literal("access_denied"),
);

/**
 * Creates a download grant (token) that allows downloading a file.
 * The grant can be limited by number of uses and/or expiration time.
 *
 * @param args.storageId - The storage ID of the file to grant access to
 * @param args.maxUses - Maximum number of times the grant can be consumed (default: 1, null for unlimited)
 * @param args.expiresAt - Optional expiration timestamp (must be in the future or null)
 *
 * @returns An object containing the downloadToken, storageId, expiration, and maxUses
 *
 * @throws Error if the file is not found, expired, or validation fails
 */
export const createDownloadGrant = mutation({
  args: {
    storageId: v.id("_storage"),
    maxUses: v.optional(v.union(v.null(), v.number())),
    expiresAt: v.optional(v.union(v.null(), v.number())),
  },
  returns: v.object({
    downloadToken: v.id("downloadGrants"),
    storageId: v.id("_storage"),
    expiresAt: v.union(v.null(), v.number()),
    maxUses: v.union(v.null(), v.number()),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const file = await findFileByStorageId(ctx, args.storageId);

    if (!file) {
      throw new ConvexError("File not found.");
    }

    if (file.expiresAt !== undefined && file.expiresAt <= now) {
      throw new ConvexError("File expired.");
    }

    const { maxUses = DEFAULT_MAX_DOWNLOAD_USES } = args;
    if (maxUses !== null && maxUses <= 0) {
      throw new ConvexError("maxUses must be at least 1 or null for unlimited.");
    }

    if (args.expiresAt != null && args.expiresAt <= now) {
      throw new ConvexError("Expiration must be in the future.");
    }

    const expiresAt = args.expiresAt ?? null;
    const downloadToken = await ctx.db.insert("downloadGrants", {
      storageId: args.storageId,
      expiresAt: expiresAt ?? undefined,
      maxUses: maxUses ?? null,
      useCount: 0,
    });

    return {
      downloadToken,
      storageId: args.storageId,
      expiresAt,
      maxUses: maxUses ?? null,
    };
  },
});

/**
 * Consumes a download grant and returns a signed download URL if successful.
 * This is a convenience function that combines consumeDownloadGrant with getUrl.
 *
 * @param args.downloadToken - The download grant token to consume
 * @param args.accessKey - Access key for verification
 *
 * @returns An object with:
 *   - status: One of "ok", "not_found", "expired", "exhausted", "file_missing", "file_expired", or "access_denied"
 *   - downloadUrl: A signed URL for downloading the file (only present if status is "ok")
 */
type DownloadConsumeUrlResult = {
  status:
    | "ok"
    | "not_found"
    | "expired"
    | "exhausted"
    | "file_missing"
    | "file_expired"
    | "access_denied";
  downloadUrl?: string;
};

export const consumeDownloadGrantForUrl = mutation({
  args: {
    downloadToken: v.id("downloadGrants"),
    accessKey: v.optional(v.string()),
  },
  returns: v.object({
    status: downloadConsumeStatusValidator,
    downloadUrl: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<DownloadConsumeUrlResult> => {
    const result = await consumeDownloadGrantCore(ctx, args);
    if (result.status !== "ok") {
      return { status: result.status };
    }
    return { status: "ok", downloadUrl: result.downloadUrl };
  },
});

/**
 * Core function for consuming a download grant.
 * Validates the grant, expiration, file existence, and access permissions.
 * Increments use count and deletes the grant if max uses is reached.
 *
 * @param ctx - The mutation context
 * @param args.downloadToken - The download grant token to consume
 * @param args.accessKey - Access key required to authorize the download
 *
 * @returns An object with status and optional storageId:
 *   - status: "ok" if successful, or an error status otherwise
 *   - storageId: The storage ID (only present if status is "ok")
 */
type DownloadConsumeResult =
  | { status: "ok"; storageId: Id<"_storage">; downloadUrl: string }
  | { status: "not_found" | "expired" | "file_missing" | "access_denied" | "file_expired" | "exhausted" };

async function consumeDownloadGrantCore(
  ctx: MutationCtx,
  args: {
    downloadToken: Id<"downloadGrants">;
    accessKey?: string;
  },
): Promise<DownloadConsumeResult> {
  const now = Date.now();
  const grant = await ctx.db.get("downloadGrants", args.downloadToken);
  if (!grant) {
    return { status: "not_found" };
  }

  if (grant.expiresAt !== undefined && grant.expiresAt <= now) {
    await ctx.db.delete(grant._id);
    return { status: "expired" };
  }

  if (grant.maxUses !== null && grant.useCount >= grant.maxUses) {
    await ctx.db.delete(grant._id);
    return { status: "exhausted" };
  }

  const filePromise = findFileByStorageId(ctx, grant.storageId);
  const accessKey = args.accessKey?.trim();
  if (!accessKey) {
    const file = await filePromise;
    if (!file) {
      await ctx.db.delete(grant._id);
      return { status: "file_missing" };
    }
    return { status: "access_denied" };
  }

  const [file, hasAccess] = await Promise.all([
    filePromise,
    hasAccessKey(ctx, {
      accessKey,
      storageId: grant.storageId,
    }),
  ]);

  if (!file) {
    await ctx.db.delete(grant._id);
    return { status: "file_missing" };
  }

  if (!hasAccess) {
    return { status: "access_denied" };
  }

  if (file.expiresAt !== undefined && file.expiresAt <= now) {
    // Schedule deletion in a separate transaction to avoid blocking
    await ctx.scheduler.runAfter(0, internal.download.deleteFileCascadeInternal, { storageId: grant.storageId });
    return { status: "file_expired" };
  }

  const downloadUrl = await ctx.storage.getUrl(grant.storageId);
  if (!downloadUrl) {
    return { status: "file_missing" };
  }

  const nextUseCount = grant.useCount + 1;
  const shouldDelete = grant.maxUses !== null && nextUseCount >= grant.maxUses;

  if (shouldDelete) {
    await ctx.db.delete(grant._id);
  } else {
    await ctx.db.patch(grant._id, { useCount: nextUseCount });
  }

  return { status: "ok", storageId: grant.storageId, downloadUrl };
}

/**
 * Internal mutation for deferred file cascade deletion.
 * Called via scheduler.runAfter to avoid blocking the main transaction.
 */
export const deleteFileCascadeInternal = internalMutation({
  args: {
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteFileCascade(ctx, args.storageId);
    return null;
  },
});
