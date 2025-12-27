import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type ReadCtx = MutationCtx | QueryCtx;

export function normalizeAccessKey(accessKey?: string | null) {
  if (typeof accessKey !== "string") {
    return null;
  }

  const trimmed = accessKey.trim();
  return trimmed === "" ? null : trimmed;
}

export function normalizeAccessKeys(accessKeys: string[]) {
  const normalized = accessKeys
    .map((key) => normalizeAccessKey(key))
    .filter((key): key is string => key != null);
  return [...new Set(normalized)];
}

export function toStorageId(storageId: string) {
  return storageId as Id<"_storage">;
}

export async function findFileByStorageId(ctx: ReadCtx, storageId: string) {
  return ctx.db
    .query("files")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
}

export async function hasAccessKey(
  ctx: ReadCtx,
  args: { accessKey: string; storageId: string },
) {
  const accessKey = normalizeAccessKey(args.accessKey);
  if (!accessKey) {
    return false;
  }

  const access = await ctx.db
    .query("fileAccess")
    .withIndex("by_accessKey_and_storageId", (q) =>
      q.eq("accessKey", accessKey).eq("storageId", args.storageId),
    )
    .first();

  return access != null;
}
