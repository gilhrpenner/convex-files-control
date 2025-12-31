import { ConvexError, v } from "convex/values";
import type { RegisteredAction } from "convex/server";
import {
  action,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { api, components, internal } from "./_generated/api";
import { ActionRetrier } from "@convex-dev/action-retrier";
import {
  findFileByStorageId,
  findFileByVirtualPath,
  normalizeVirtualPath,
  toStorageId,
} from "./lib";
import { storageProviderValidator } from "./storageProvider";
import {
  createR2Client,
  deleteR2Object,
  getR2DownloadUrl,
  r2ConfigValidator,
  requireR2Config,
} from "./r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { R2Config, StorageProvider } from "../shared/types";

type TransferFileRecord = {
  _id: Id<"files">;
  storageId: string;
  storageProvider: StorageProvider;
  virtualPath: string | null;
};

type TransferFileArgs = {
  storageId: string;
  targetProvider: StorageProvider;
  r2Config?: R2Config;
  virtualPath?: string;
};

type TransferResult = {
  storageId: string;
  storageProvider: StorageProvider;
};

const retrier = new ActionRetrier(components.actionRetrier);

const useActionRetrier =
  typeof process === "undefined" ||
  (!process.env.VITEST && process.env.NODE_ENV !== "test");

export const getFileForTransfer = internalQuery({
  args: {
    storageId: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id("files"),
      storageId: v.string(),
      storageProvider: storageProviderValidator,
      virtualPath: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const file = await findFileByStorageId(ctx, args.storageId);
    if (!file) {
      return null;
    }
    return {
      _id: file._id,
      storageId: file.storageId,
      storageProvider: file.storageProvider,
      virtualPath: file.virtualPath ?? null,
    };
  },
});

export const getFileByVirtualPathForTransfer = internalQuery({
  args: {
    virtualPath: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id("files"),
      storageId: v.string(),
      storageProvider: storageProviderValidator,
      virtualPath: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const file = await findFileByVirtualPath(ctx, args.virtualPath);
    if (!file) {
      return null;
    }
    return {
      _id: file._id,
      storageId: file.storageId,
      storageProvider: file.storageProvider,
      virtualPath: file.virtualPath ?? null,
    };
  },
});

export const transferFile: RegisteredAction<
  "public",
  TransferFileArgs,
  Promise<TransferResult>
> = action({
  args: {
    storageId: v.string(),
    targetProvider: storageProviderValidator,
    r2Config: v.optional(r2ConfigValidator),
    virtualPath: v.optional(v.string()),
  },
  returns: v.object({
    storageId: v.string(),
    storageProvider: storageProviderValidator,
  }),
  handler: async (ctx, args): Promise<TransferResult> => {
    const file: TransferFileRecord | null = await ctx.runQuery(
      internal.transfer.getFileForTransfer,
      {
        storageId: args.storageId,
      },
    );
    if (!file) {
      throw new ConvexError("File not found.");
    }

    if (file.storageProvider === args.targetProvider) {
      throw new ConvexError("File already stored in target provider.");
    }

    const requestedVirtualPath =
      args.virtualPath === undefined
        ? undefined
        : normalizeVirtualPath(args.virtualPath);
    if (args.virtualPath !== undefined && !requestedVirtualPath) {
      throw new ConvexError("Virtual path cannot be empty.");
    }

    if (requestedVirtualPath) {
      const existing = await ctx.runQuery(getFileByVirtualPathForTransfer, {
        virtualPath: requestedVirtualPath,
      });
      if (existing && existing._id !== file._id) {
        throw new ConvexError("Virtual path already exists.");
      }
    }

    const needsR2 = file.storageProvider === "r2" || args.targetProvider === "r2";
    const r2Config = needsR2 ? requireR2Config(args.r2Config, "R2 transfers") : null;

    let sourceUrl: string | null = null;
    if (file.storageProvider === "convex") {
      sourceUrl = await ctx.storage.getUrl(toStorageId(file.storageId));
    } else if (r2Config) {
      sourceUrl = await getR2DownloadUrl(r2Config, file.storageId);
    }

    if (!sourceUrl) {
      throw new ConvexError("File not found.");
    }

    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new ConvexError("File not found.");
    }

    const contentType = response.headers.get("Content-Type") ?? undefined;

    let newStorageId: string;
    if (args.targetProvider === "convex") {
      const blob = await response.blob();
      newStorageId = await ctx.storage.store(blob);
    } else {
      const buffer = await response.arrayBuffer();
      const body = new Uint8Array(buffer);
      newStorageId =
        requestedVirtualPath ?? file.virtualPath ?? crypto.randomUUID();
      const r2 = createR2Client(r2Config!);
      await r2.send(
        new PutObjectCommand({
          Bucket: r2Config!.bucketName,
          Key: newStorageId,
          Body: body,
          ContentType: contentType,
        }),
      );
    }

    return await ctx.runMutation(internal.transfer.commitTransfer, {
      storageId: args.storageId,
      newStorageId,
      targetProvider: args.targetProvider,
      sourceProvider: file.storageProvider,
      r2Config: r2Config ?? undefined,
      ...(requestedVirtualPath !== undefined ? { virtualPath: requestedVirtualPath } : {}),
    });
  },
});

export const commitTransfer = internalMutation({
  args: {
    storageId: v.string(),
    newStorageId: v.string(),
    targetProvider: storageProviderValidator,
    sourceProvider: storageProviderValidator,
    r2Config: v.optional(r2ConfigValidator),
    virtualPath: v.optional(v.union(v.null(), v.string())),
  },
  returns: v.object({
    storageId: v.string(),
    storageProvider: storageProviderValidator,
  }),
  handler: async (ctx, args) => {
    const file = await findFileByStorageId(ctx, args.storageId);
    if (!file) {
      throw new ConvexError("File not found.");
    }

    if (file.storageProvider !== args.sourceProvider) {
      throw new ConvexError("File provider changed during transfer.");
    }

    const [accessRows, grants] = await Promise.all([
      ctx.db
        .query("fileAccess")
        .withIndex("by_fileId", (q) => q.eq("fileId", file._id))
        .collect(),
      ctx.db
        .query("downloadGrants")
        .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
        .collect(),
    ]);

    const updates: {
      storageId: string;
      storageProvider: StorageProvider;
      virtualPath?: string | undefined;
    } = {
      storageId: args.newStorageId,
      storageProvider: args.targetProvider,
    };

    if (args.virtualPath !== undefined) {
      updates.virtualPath = args.virtualPath ?? undefined;
    }

    await Promise.all([
      ctx.db.patch(file._id, updates),
      ...accessRows.map((row) =>
        ctx.db.patch(row._id, { storageId: args.newStorageId }),
      ),
      ...grants.map((grant) =>
        ctx.db.patch(grant._id, { storageId: args.newStorageId }),
      ),
    ]);

    await deleteStorageFileWithRetry(ctx, {
      storageId: args.storageId,
      storageProvider: args.sourceProvider,
      r2Config: args.r2Config ?? undefined,
    });

    return {
      storageId: args.newStorageId,
      storageProvider: args.targetProvider,
    };
  },
});

async function deleteStorageFileWithRetry(
  ctx: MutationCtx,
  args: {
    storageId: string;
    storageProvider: "convex" | "r2";
    r2Config?: {
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucketName: string;
    };
  },
) {
  if (!useActionRetrier) {
    if (args.storageProvider === "convex") {
      await ctx.storage.delete(toStorageId(args.storageId));
      return;
    }

    const r2Config = requireR2Config(args.r2Config, "R2 deletes");
    await deleteR2Object(r2Config, args.storageId);
    return;
  }

  await retrier.run(ctx, api.cleanUp.deleteStorageFile, args);
}
