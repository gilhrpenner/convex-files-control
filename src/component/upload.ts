import { ConvexError, v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import {
  findFileByStorageId,
  normalizeAccessKeys,
  toStorageId,
} from "./lib";
import { PENDING_UPLOAD_TTL_MS } from "./constants";
import {
  fileMetadataInputValidator,
  fileMetadataValidator,
} from "./validators";

/**
 * Start the two-step upload flow by issuing a signed upload URL.
 *
 * @returns The upload URL, a short-lived upload token, and its expiration time.
 *
 * @example
 * ```ts
 * const { uploadUrl, uploadToken } =
 *   await ctx.runMutation(components.convexFilesControl.upload.generateUploadUrl, {});
 * ```
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.object({
    uploadUrl: v.string(),
    uploadToken: v.id("pendingUploads"),
    uploadTokenExpiresAt: v.number(),
  }),
  handler: async (ctx) => {
    const uploadTokenExpiresAt = Date.now() + PENDING_UPLOAD_TTL_MS;

    const [uploadUrl, uploadToken] = await Promise.all([
      ctx.storage.generateUploadUrl(),
      ctx.db.insert("pendingUploads", {
        expiresAt: uploadTokenExpiresAt,
      }),
    ]);

    return { uploadUrl, uploadToken, uploadTokenExpiresAt };
  },
});

/**
 * Complete the upload flow by registering the uploaded file.
 *
 * @param args.uploadToken - The token from `generateUploadUrl`.
 * @param args.storageId - The storage ID returned by the upload endpoint.
 * @param args.accessKeys - Access keys that can read the file.
 * @param args.expiresAt - Optional expiration timestamp.
 * @returns File metadata and expiration.
 *
 * @example
 * ```ts
 * await ctx.runMutation(components.convexFilesControl.upload.finalizeUpload, {
 *   uploadToken,
 *   storageId,
 *   accessKeys: ["user_123"],
 *   expiresAt: null,
 * });
 * ```
 */
export const finalizeUpload = mutation({
  args: {
    uploadToken: v.id("pendingUploads"),
    storageId: v.string(),
    accessKeys: v.array(v.string()),
    expiresAt: v.optional(v.union(v.null(), v.number())),
  },
  returns: v.object({
    storageId: v.string(),
    expiresAt: v.union(v.null(), v.number()),
    metadata: fileMetadataValidator,
  }),
  handler: async (ctx, args) => {
    const pendingUpload = await ctx.db.get("pendingUploads", args.uploadToken);
    if (!pendingUpload) {
      throw new ConvexError("Upload token not found.");
    }

    if (pendingUpload.expiresAt <= Date.now()) {
      throw new ConvexError("Upload token expired.");
    }

    const [result] = await Promise.all([
      registerFileCore(ctx, { ...args }),
      ctx.db.delete(args.uploadToken),
    ]);

    return result;
  },
});

/**
 * Register an already-uploaded storage file.
 *
 * This is useful when you upload via an HTTP action and want to attach access
 * control and metadata after the upload.
 *
 * @param args.storageId - The storage ID to register.
 * @param args.accessKeys - Access keys that can read the file.
 * @param args.expiresAt - Optional expiration timestamp.
 * @param args.metadata - Optional metadata; if omitted, it is fetched from storage.
 * @returns File metadata and expiration.
 *
 * @example
 * ```ts
 * const storageId = await ctx.storage.store(fileBlob);
 * return await ctx.runMutation(components.convexFilesControl.upload.registerFile, {
 *   storageId,
 *   accessKeys: ["user_123"],
 *   metadata: { size: fileBlob.size, sha256, contentType: fileBlob.type },
 * });
 * ```
 */
export const registerFile = mutation({
  args: {
    storageId: v.string(),
    accessKeys: v.array(v.string()),
    expiresAt: v.optional(v.union(v.null(), v.number())),
    metadata: v.optional(fileMetadataInputValidator),
  },
  returns: v.object({
    storageId: v.string(),
    expiresAt: v.union(v.null(), v.number()),
    metadata: fileMetadataValidator,
  }),
  handler: async (ctx, args) => {
    return registerFileCore(ctx, { ...args });
  },
});

async function registerFileCore(
  ctx: MutationCtx,
  args: {
    storageId: string;
    accessKeys: string[];
    expiresAt?: number | null;
    metadata?: {
      size: number;
      sha256: string;
      contentType: string | null;
    };
  },
) {
  const accessKeys = normalizeAccessKeys(args.accessKeys);
  if (accessKeys.length === 0) {
    throw new ConvexError("At least one accessKey is required.");
  }

  if (args.expiresAt != null && args.expiresAt <= Date.now()) {
    throw new ConvexError("Expiration must be in the future.");
  }

  const [existingRegistration, systemFile] = await Promise.all([
    findFileByStorageId(ctx, args.storageId),
    args.metadata ? null : ctx.db.system.get(toStorageId(args.storageId)),
  ]);

  if (existingRegistration) {
    throw new ConvexError("File already registered.");
  }

  const metadata = args.metadata ?? systemFile;
  if (!metadata) {
    throw new ConvexError("Storage file not found.");
  }

  const fileId = await ctx.db.insert("files", {
    storageId: args.storageId,
    expiresAt: args.expiresAt ?? undefined,
  });

  await Promise.all(
    accessKeys.map((accessKey) =>
      ctx.db.insert("fileAccess", {
        fileId,
        storageId: args.storageId,
        accessKey,
      })
    ),
  );

  return {
    storageId: args.storageId,
    expiresAt: args.expiresAt ?? null,
    metadata: {
      storageId: args.storageId,
      size: metadata.size,
      sha256: metadata.sha256,
      contentType: metadata.contentType ?? null,
    },
  };
}
