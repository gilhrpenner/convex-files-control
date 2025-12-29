import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  findFileByStorageId,
  hasAccessKey,
  hashPassword,
  normalizeAccessKey,
  toStorageId,
  verifyPassword,
} from "./lib";
import type { Id } from "./_generated/dataModel";
import { deleteFileCascade } from "./cleanUp";
import { DEFAULT_MAX_DOWNLOAD_USES } from "./constants";
import { downloadConsumeStatusValidator } from "./validators";
import { r2ConfigValidator, requireR2Config, getR2DownloadUrl } from "./r2";

/**
 * Create a one-time (or multi-use) download token for a file.
 *
 * @param args.storageId - The file's storage ID.
 * @param args.maxUses - Maximum uses; `null` for unlimited.
 * @param args.expiresAt - Optional expiration timestamp.
 * @param args.password - Optional password to protect the grant.
 *
 * Passwords are hashed with PBKDF2-SHA256 and a per-grant salt.
 * @returns The download token and grant settings.
 *
 * @example
 * ```ts
 * import { buildDownloadUrl } from "@gilhrpenner/convex-files-control";
 *
 * const grant = await ctx.runMutation(
 *   components.convexFilesControl.download.createDownloadGrant,
 *   { storageId, maxUses: 3, expiresAt: Date.now() + 10 * 60 * 1000 },
 * );
 * const url = buildDownloadUrl({ baseUrl, downloadToken: grant.downloadToken });
 * ```
 */
export const createDownloadGrant = mutation({
  args: {
    storageId: v.string(),
    maxUses: v.optional(v.union(v.null(), v.number())),
    expiresAt: v.optional(v.union(v.null(), v.number())),
    password: v.optional(v.string()),
    shareableLink: v.optional(v.boolean()),
  },
  returns: v.object({
    downloadToken: v.id("downloadGrants"),
    storageId: v.string(),
    expiresAt: v.union(v.null(), v.number()),
    maxUses: v.union(v.null(), v.number()),
    shareableLink: v.boolean(),
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

    let passwordRecord: Awaited<ReturnType<typeof hashPassword>> | null = null;
    if (args.password !== undefined) {
      if (args.password.trim() === "") {
        throw new ConvexError("Password cannot be empty.");
      }
      passwordRecord = await hashPassword(args.password);
    }

    const expiresAt = args.expiresAt ?? null;
    const passwordFields = passwordRecord
      ? {
          passwordHash: passwordRecord.hash,
          passwordSalt: passwordRecord.salt,
          passwordIterations: passwordRecord.iterations,
          passwordAlgorithm: passwordRecord.algorithm,
        }
      : {};
    const shareableLink = args.shareableLink ?? false;
    const downloadToken = await ctx.db.insert("downloadGrants", {
      storageId: args.storageId,
      expiresAt: expiresAt ?? undefined,
      maxUses: maxUses ?? null,
      useCount: 0,
      shareableLink,
      ...passwordFields,
    });

    return {
      downloadToken,
      storageId: args.storageId,
      expiresAt,
      maxUses: maxUses ?? null,
      shareableLink,
    };
  },
});

/**
 * Consume a download grant and return a signed URL when allowed.
 *
 * @param args.downloadToken - The grant token to consume.
 * @param args.accessKey - Optional access key for authorization.
 * @param args.password - Optional password for the grant.
 * @returns Status plus a signed download URL when status is `"ok"`.
 *
 * Note: if you pass passwords via query params to the HTTP download route,
 * they can be logged or cached. Prefer headers or POST flows when possible.
 *
 * @example
 * ```ts
 * const result = await ctx.runMutation(
 *   components.convexFilesControl.download.consumeDownloadGrantForUrl,
 *   { downloadToken, accessKey },
 * );
 * if (result.status === "ok") return result.downloadUrl;
 * ```
 */
type DownloadConsumeUrlResult = {
  status:
    | "ok"
    | "not_found"
    | "expired"
    | "exhausted"
    | "file_missing"
    | "file_expired"
    | "access_denied"
    | "password_required"
    | "invalid_password";
  downloadUrl?: string;
};

export const consumeDownloadGrantForUrl = mutation({
  args: {
    downloadToken: v.id("downloadGrants"),
    accessKey: v.optional(v.string()),
    password: v.optional(v.string()),
    r2Config: v.optional(r2ConfigValidator),
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

type DownloadConsumeResult =
  | { status: "ok"; storageId: string; downloadUrl: string }
  | {
      status:
        | "not_found"
        | "expired"
        | "file_missing"
        | "access_denied"
        | "file_expired"
        | "exhausted"
        | "password_required"
        | "invalid_password";
    };

async function consumeDownloadGrantCore(
  ctx: MutationCtx,
  args: {
    downloadToken: Id<"downloadGrants">;
    accessKey?: string;
    password?: string;
    r2Config?: {
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucketName: string;
    };
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
  const accessKey = normalizeAccessKey(args.accessKey);

  // Shareable links bypass access key validation
  if (grant.shareableLink) {
    const file = await filePromise;
    if (!file) {
      await ctx.db.delete(grant._id);
      return { status: "file_missing" };
    }
  } else {
    // Regular grants require a valid access key
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
  }

  const file = await filePromise;
  if (!file) {
    await ctx.db.delete(grant._id);
    return { status: "file_missing" };
  }

  if (grant.passwordHash) {
    const password = args.password;
    if (!password || password.trim() === "") {
      return { status: "password_required" };
    }

    const validPassword = await verifyPassword(password, {
      hash: grant.passwordHash,
      salt: grant.passwordSalt ?? "",
      iterations: grant.passwordIterations ?? 0,
      algorithm: grant.passwordAlgorithm,
    });
    if (!validPassword) {
      return { status: "invalid_password" };
    }
  }

  if (file.expiresAt !== undefined && file.expiresAt <= now) {
    await ctx.scheduler.runAfter(
      0,
      internal.download.deleteFileCascadeInternal,
      { storageId: grant.storageId, r2Config: args.r2Config },
    );
    return { status: "file_expired" };
  }

  let downloadUrl: string | null = null;
  if (file.storageProvider === "convex") {
    downloadUrl = await ctx.storage.getUrl(toStorageId(grant.storageId));
  } else {
    const r2Config = requireR2Config(args.r2Config, "R2 downloads");
    downloadUrl = await getR2DownloadUrl(r2Config, grant.storageId);
  }
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
 * Internal mutation to delete a file and its related records.
 *
 * Use via `scheduler.runAfter` to keep user-facing mutations fast.
 */
export const deleteFileCascadeInternal = internalMutation({
  args: {
    storageId: v.string(),
    r2Config: v.optional(r2ConfigValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await deleteFileCascade(ctx, args.storageId, args.r2Config);
    return null;
  },
});
