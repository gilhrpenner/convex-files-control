import { ConvexError, v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { findFileByStorageId, normalizeAccessKeys } from "./lib";

const PENDING_UPLOAD_TTL_MS = 60 * 60 * 1000;
const fileMetadataValidator = v.object({
  storageId: v.id("_storage"),
  size: v.number(),
  sha256: v.string(),
  contentType: v.union(v.string(), v.null()),
});

const fileMetadataInputValidator = v.object({
  size: v.number(),
  sha256: v.string(),
  contentType: v.union(v.string(), v.null()),
});

/**
 * Generates a signed upload URL and creates a pending upload token.
 *
 * This is the first step in the upload flow. Clients call this to get a URL
 * where they can upload a file, along with a token that must be used to
 * finalize the upload.
 *
 * @returns An object containing:
 *   - `uploadUrl`: The signed URL where the file can be uploaded
 *   - `uploadToken`: A token that must be used with `finalizeUpload`
 *   - `uploadTokenExpiresAt`: Timestamp when the upload token expires
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
 * Finalizes an upload by registering the file and cleaning up the upload token.
 *
 * This is the second step in the upload flow. After uploading a file to the URL
 * from `generateUploadUrl`, clients call this to register the file and complete
 * the upload process. The upload token is validated and then deleted.
 *
 * @param args.uploadToken - The upload token from `generateUploadUrl`
 * @param args.storageId - The Convex storage ID of the uploaded file
 * @param args.accessKeys - Array of access keys that grant access to this file
 * @param args.expiresAt - Optional expiration timestamp (null for forever)
 *
 * @returns File registration metadata
 * @throws Error if upload token not found, expired, or file registration fails
 */
export const finalizeUpload = mutation({
  args: {
    uploadToken: v.id("pendingUploads"),
    storageId: v.id("_storage"),
    accessKeys: v.array(v.string()),
    expiresAt: v.optional(v.union(v.null(), v.number())),
  },
  returns: v.object({
    storageId: v.id("_storage"),
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
 * Registers an existing storage file with access control.
 *
 * Use this function to register files that have already been uploaded to Convex storage
 * via HTTP actions. This is different from `finalizeUpload`, which
 * is part of the two-step client upload flow that requires an upload token.
 *
 * This function creates file records and access key mappings for the specified storage file.
 * It's particularly useful when uploading files via HTTP actions, where you can optionally
 * provide metadata directly instead of fetching it from storage.
 *
 * @param args.storageId - The storage ID of the file to register
 * @param args.accessKeys - Array of access keys that grant access to this file
 * @param args.expiresAt - Optional expiration timestamp (must be in the future or null)
 * @param args.metadata - Optional file metadata. If not provided, metadata is fetched from storage.
 *
 * @returns An object containing the registered file's storageId, expiration, and metadata
 * @throws Error if the file is already registered, if expiresAt is in the past, or if metadata cannot be retrieved
 *
 * @example
 * // In an HTTP action after uploading a file:
 * const storageId = await ctx.storage.store(fileBlob);
 * return await ctx.runMutation(api.component.upload.registerFile, {
 *   storageId,
 *   accessKeys: ["user_123"],
 *   metadata: { size: fileBlob.size, sha256: hash, contentType: fileBlob.type }
 * });
 */
export const registerFile = mutation({
  args: {
    storageId: v.id("_storage"),
    accessKeys: v.array(v.string()),
    expiresAt: v.optional(v.union(v.null(), v.number())),
    metadata: v.optional(fileMetadataInputValidator),
  },
  returns: v.object({
    storageId: v.id("_storage"),
    expiresAt: v.union(v.null(), v.number()),
    metadata: fileMetadataValidator,
  }),
  handler: async (ctx, args) => {
    return registerFileCore(ctx, { ...args });
  },
});

/**
 * Core function that registers a file in the system with access control.
 *
 * This internal helper function performs the actual file registration logic:
 * validates access keys, existing registrations, validates expiration, fetches
 * metadata if needed, adds file records, and sets up access key associations.
 *
 * @param ctx - Mutation context
 * @param args.storageId - The Convex storage ID of the file
 * @param args.accessKeys - Array of access keys (will be normalized)
 * @param args.expiresAt - Optional expiration timestamp (null for forever)
 * @param args.metadata - Optional file metadata
 *
 * @returns File registration metadata
 * @throws Error if no access keys, file already registered, expiresAt invalid, or storage file not found
 */
async function registerFileCore(
  ctx: MutationCtx,
  args: {
    storageId: Id<"_storage">;
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
    args.metadata ? null : ctx.db.system.get(args.storageId),
  ]);

  if (existingRegistration) {
    throw new ConvexError("File already registered.");
  }

  const metadata = args.metadata ?? systemFile;
  if (!metadata) {
    throw new ConvexError("Storage file not found.");
  }

  await Promise.all([
    ctx.db.insert("files", {
      storageId: args.storageId,
      expiresAt: args.expiresAt ?? undefined,
    }),

    ...accessKeys.map((accessKey) =>
      ctx.db.insert("fileAccess", {
        storageId: args.storageId,
        accessKey,
      })
    ),
  ]);

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
