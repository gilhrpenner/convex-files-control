import { ConvexError, v } from "convex/values";
import { action, mutation, type MutationCtx } from "./_generated/server";
import {
  findFileByStorageId,
  findFileByVirtualPath,
  normalizeAccessKeys,
  normalizeVirtualPath,
  toStorageId,
} from "./lib";
import { PENDING_UPLOAD_TTL_MS } from "./constants";
import {
  fileMetadataInputValidator,
  fileMetadataValidator,
} from "./validators";
import { storageProviderValidator } from "./storageProvider";
import {
  getR2UploadUrl,
  getR2DownloadUrl,
  r2ConfigValidator,
  requireR2Config,
} from "./r2";

/**
 * Start the two-step upload flow by issuing a signed upload URL.
 *
 * @returns The upload URL, a short-lived upload token, and its expiration time.
 *
 * @example
 * ```ts
 * const { uploadUrl, uploadToken } =
 *   await ctx.runMutation(components.convexFilesControl.upload.generateUploadUrl, {
 *     provider: "convex",
 *   });
 * ```
 */
export const generateUploadUrl = mutation({
  args: {
    provider: storageProviderValidator,
    r2Config: v.optional(r2ConfigValidator),
    virtualPath: v.optional(v.string()),
  },
  returns: v.object({
    uploadUrl: v.string(),
    uploadToken: v.id("pendingUploads"),
    uploadTokenExpiresAt: v.number(),
    storageProvider: storageProviderValidator,
    storageId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const uploadTokenExpiresAt = Date.now() + PENDING_UPLOAD_TTL_MS;

    let uploadUrl: string;
    let storageId: string | null = null;
    const virtualPath = normalizeVirtualPath(args.virtualPath);
    if (args.virtualPath !== undefined && !virtualPath) {
      throw new ConvexError("Virtual path cannot be empty.");
    }

    if (virtualPath) {
      const existing = await findFileByVirtualPath(ctx, virtualPath);
      if (existing) {
        throw new ConvexError("Virtual path already exists.");
      }
    }

    if (args.provider === "convex") {
      uploadUrl = await ctx.storage.generateUploadUrl();
    } else {
      const r2Config = requireR2Config(args.r2Config, "R2 uploads");
      storageId = virtualPath ?? crypto.randomUUID();
      uploadUrl = await getR2UploadUrl(r2Config, storageId);
    }

    const uploadToken = await ctx.db.insert("pendingUploads", {
      expiresAt: uploadTokenExpiresAt,
      storageProvider: args.provider,
      storageId: storageId ?? undefined,
      virtualPath: virtualPath ?? undefined,
    });

    return {
      uploadUrl,
      uploadToken,
      uploadTokenExpiresAt,
      storageProvider: args.provider,
      storageId,
    };
  },
});

/**
 * Complete the upload flow by registering the uploaded file.
 *
 * @param args.uploadToken - The token from `generateUploadUrl`.
 * @param args.storageId - The storage ID returned by the upload endpoint.
 * @param args.accessKeys - Access keys that can read the file.
 * @param args.expiresAt - Optional expiration timestamp.
 * @param args.metadata - Optional metadata; useful for non-Convex providers.
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
    metadata: v.optional(fileMetadataInputValidator),
    virtualPath: v.optional(v.string()),
  },
  returns: v.object({
    storageId: v.string(),
    storageProvider: storageProviderValidator,
    expiresAt: v.union(v.null(), v.number()),
    metadata: v.union(fileMetadataValidator, v.null()),
    virtualPath: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const pendingUpload = await ctx.db.get("pendingUploads", args.uploadToken);
    if (!pendingUpload) {
      throw new ConvexError("Upload token not found.");
    }

    if (pendingUpload.expiresAt <= Date.now()) {
      throw new ConvexError("Upload token expired.");
    }

    if (
      pendingUpload.storageId &&
      pendingUpload.storageId !== args.storageId
    ) {
      throw new ConvexError("Storage ID does not match pending upload.");
    }

    const normalizedVirtualPath = normalizeVirtualPath(args.virtualPath);
    if (args.virtualPath !== undefined && !normalizedVirtualPath) {
      throw new ConvexError("Virtual path cannot be empty.");
    }
    const pendingVirtualPath = normalizeVirtualPath(pendingUpload.virtualPath);
    if (pendingVirtualPath && normalizedVirtualPath && pendingVirtualPath !== normalizedVirtualPath) {
      throw new ConvexError("Virtual path does not match pending upload.");
    }

    const [result] = await Promise.all([
      registerFileCore(ctx, {
        ...args,
        storageProvider: pendingUpload.storageProvider,
        virtualPath: normalizedVirtualPath ?? pendingVirtualPath ?? undefined,
      }),
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
 * @param args.storageProvider - Storage provider for the file.
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
    storageProvider: storageProviderValidator,
    accessKeys: v.array(v.string()),
    expiresAt: v.optional(v.union(v.null(), v.number())),
    metadata: v.optional(fileMetadataInputValidator),
    virtualPath: v.optional(v.string()),
  },
  returns: v.object({
    storageId: v.string(),
    storageProvider: storageProviderValidator,
    expiresAt: v.union(v.null(), v.number()),
    metadata: v.union(fileMetadataValidator, v.null()),
    virtualPath: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    return registerFileCore(ctx, { ...args });
  },
});

async function registerFileCore(
  ctx: MutationCtx,
  args: {
    storageId: string;
    storageProvider: "convex" | "r2";
    accessKeys: string[];
    expiresAt?: number | null;
    metadata?: {
      size: number;
      sha256: string;
      contentType: string | null;
    };
    virtualPath?: string;
  },
) {
  const accessKeys = normalizeAccessKeys(args.accessKeys);
  if (accessKeys.length === 0) {
    throw new ConvexError("At least one accessKey is required.");
  }

  if (args.expiresAt != null && args.expiresAt <= Date.now()) {
    throw new ConvexError("Expiration must be in the future.");
  }

  const virtualPath = normalizeVirtualPath(args.virtualPath);
  if (args.virtualPath !== undefined && !virtualPath) {
    throw new ConvexError("Virtual path cannot be empty.");
  }

  const [existingRegistration, systemFile, existingVirtualPath] = await Promise.all([
    findFileByStorageId(ctx, args.storageId),
    args.metadata || args.storageProvider !== "convex"
      ? null
      : ctx.db.system.get(toStorageId(args.storageId)),
    virtualPath ? findFileByVirtualPath(ctx, virtualPath) : Promise.resolve(null),
  ]);

  if (existingRegistration) {
    throw new ConvexError("File already registered.");
  }

  if (existingVirtualPath) {
    throw new ConvexError("Virtual path already exists.");
  }

  const metadata =
    args.metadata ??
    (args.storageProvider === "convex" ? systemFile : null);
  if (!metadata && args.storageProvider === "convex") {
    throw new ConvexError("Storage file not found.");
  }

  const fileId = await ctx.db.insert("files", {
    storageId: args.storageId,
    storageProvider: args.storageProvider,
    expiresAt: args.expiresAt ?? undefined,
    virtualPath: virtualPath ?? undefined,
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
    storageProvider: args.storageProvider,
    expiresAt: args.expiresAt ?? null,
    virtualPath: virtualPath ?? null,
    metadata: metadata
      ? {
          storageId: args.storageId,
          size: metadata.size,
          sha256: metadata.sha256,
          contentType: metadata.contentType ?? null,
        }
      : null,
  };
}

/**
 * Compute metadata for an R2 object by downloading it server-side.
 *
 * @param args.storageId - The R2 object key.
 * @param args.r2Config - R2 credentials and bucket.
 * @returns File metadata for the object.
 */
export const computeR2Metadata = action({
  args: {
    storageId: v.string(),
    r2Config: r2ConfigValidator,
  },
  returns: fileMetadataValidator,
  handler: async (_ctx, args) => {
    const r2Config = requireR2Config(args.r2Config, "R2 metadata");
    const url = await getR2DownloadUrl(r2Config, args.storageId);
    const response = await fetch(url);
    if (!response.ok) {
      throw new ConvexError("R2 file not found.");
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = bytesToBase64(new Uint8Array(digest));

    return {
      storageId: args.storageId,
      size: bytes.byteLength,
      sha256,
      contentType: response.headers.get("Content-Type") ?? null,
    };
  },
});

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}
