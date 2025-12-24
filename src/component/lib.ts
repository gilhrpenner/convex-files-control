import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type ReadCtx = MutationCtx | QueryCtx;

export function normalizeAccessKeys(accessKeys: string[]) {
  return [...new Set(accessKeys.map((k) => k.trim()).filter(Boolean))];
}

export async function findFileByStorageId(
  ctx: ReadCtx,
  storageId: Id<"_storage">,
) {
  return ctx.db
    .query("files")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
}

/**
 * Checks if a given access key grants access to a specific file.
 *
 * @param ctx - The mutation context
 * @param args.accessKey - The access key to check
 * @param args.storageId - The storage ID of the file to check access for
 *
 * @returns true if the access key grants access to the file, false otherwise
 */
export async function hasAccessKey(
  ctx: ReadCtx,
  args: { accessKey: string; storageId: Id<"_storage"> },
) {
  const [accessKey] = normalizeAccessKeys([args.accessKey]);
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
