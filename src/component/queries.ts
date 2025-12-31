import { paginator } from "convex-helpers/server/pagination";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  hasAccessKey as hasAccessKeyForFile,
  normalizeAccessKey,
  normalizeVirtualPath,
} from "./lib";
import schema from "./schema";
import {
  downloadGrantSummaryValidator,
  fileSummaryValidator,
  toDownloadGrantSummary,
  toFileSummary,
} from "./validators";

/**
 * List files in storage with cursor-based pagination.
 *
 * @param args.paginationOpts - Cursor pagination options.
 * @returns A pagination result containing file summaries.
 *
 * @example
 * ```ts
 * const first = await ctx.runQuery(
 *   components.convexFilesControl.queries.listFilesPage,
 *   { paginationOpts: { numItems: 50, cursor: null } },
 * );
 * const next = await ctx.runQuery(
 *   components.convexFilesControl.queries.listFilesPage,
 *   { paginationOpts: { numItems: 50, cursor: first.continueCursor } },
 * );
 * ```
 */
export const listFilesPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(fileSummaryValidator),
  handler: async (ctx, args) => {
    const rows = await paginator(ctx.db, schema)
      .query("files")
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...rows,
      page: rows.page.map(toFileSummary),
    };
  },
});

/**
 * List files accessible by a given access key using pagination.
 *
 * @param args.accessKey - Access key to filter by.
 * @param args.paginationOpts - Cursor pagination options.
 * @returns A pagination result containing file summaries.
 *
 * @example
 * ```ts
 * const page = await ctx.runQuery(
 *   components.convexFilesControl.queries.listFilesByAccessKeyPage,
 *   { accessKey: "user_123", paginationOpts: { numItems: 25, cursor: null } },
 * );
 * ```
 */
export const listFilesByAccessKeyPage = query({
  args: {
    accessKey: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(fileSummaryValidator),
  handler: async (ctx, args) => {
    const accessKey = normalizeAccessKey(args.accessKey) ?? "";
    const accessRecords = await paginator(ctx.db, schema)
      .query("fileAccess")
      .withIndex("by_accessKey_and_storageId", (q) =>
        q.eq("accessKey", accessKey),
      )
      .paginate(args.paginationOpts);

    const files = await Promise.all(
      accessRecords.page.map((record) => ctx.db.get(record.fileId)),
    );

    const page = files
      .filter((file): file is NonNullable<typeof file> => file != null)
      .map(toFileSummary);

    return {
      ...accessRecords,
      page,
    };
  },
});

/**
 * Fetch a file summary by storage ID.
 *
 * @param args.storageId - The file's storage ID.
 * @returns The file summary or `null` if not found.
 *
 * @example
 * ```ts
 * const file = await ctx.runQuery(
 *   components.convexFilesControl.queries.getFile,
 *   { storageId },
 * );
 * ```
 */
export const getFile = query({
  args: {
    storageId: v.string(),
  },
  returns: v.union(fileSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    const file = await ctx.db
      .query("files")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();

    if (!file) {
      return null;
    }

    return toFileSummary(file);
  },
});

/**
 * Fetch a file summary by virtual path.
 *
 * @param args.virtualPath - The file's virtual path.
 * @returns The file summary or `null` if not found.
 *
 * @example
 * ```ts
 * const file = await ctx.runQuery(
 *   components.convexFilesControl.queries.getFileByVirtualPath,
 *   { virtualPath: "/tenant/123/report.pdf" },
 * );
 * ```
 */
export const getFileByVirtualPath = query({
  args: {
    virtualPath: v.string(),
  },
  returns: v.union(fileSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    const virtualPath = normalizeVirtualPath(args.virtualPath);
    if (!virtualPath) {
      return null;
    }

    const file = await ctx.db
      .query("files")
      .withIndex("by_virtualPath", (q) => q.eq("virtualPath", virtualPath))
      .first();

    if (!file) {
      return null;
    }

    return toFileSummary(file);
  },
});

/**
 * List access keys for a file using pagination.
 *
 * @param args.storageId - The file's storage ID.
 * @param args.paginationOpts - Cursor pagination options.
 * @returns A pagination result containing access keys.
 *
 * @example
 * ```ts
 * const page = await ctx.runQuery(
 *   components.convexFilesControl.queries.listAccessKeysPage,
 *   { storageId, paginationOpts: { numItems: 25, cursor: null } },
 * );
 * ```
 */
export const listAccessKeysPage = query({
  args: {
    storageId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(v.string()),
  handler: async (ctx, args) => {
    const rows = await paginator(ctx.db, schema)
      .query("fileAccess")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .paginate(args.paginationOpts);

    return {
      ...rows,
      page: rows.page.map((record) => record.accessKey),
    };
  },
});

/**
 * List download grants with cursor pagination.
 *
 * @param args.paginationOpts - Cursor pagination options.
 * @returns A pagination result containing grant summaries.
 *
 * @example
 * ```ts
 * const page = await ctx.runQuery(
 *   components.convexFilesControl.queries.listDownloadGrantsPage,
 *   { paginationOpts: { numItems: 25, cursor: null } },
 * );
 * ```
 */
export const listDownloadGrantsPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(downloadGrantSummaryValidator),
  handler: async (ctx, args) => {
    const rows = await paginator(ctx.db, schema)
      .query("downloadGrants")
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...rows,
      page: rows.page.map(toDownloadGrantSummary),
    };
  },
});

/**
 * Check whether an access key grants access to a file.
 *
 * @param args.storageId - The file's storage ID.
 * @param args.accessKey - The access key to verify.
 * @returns `true` if the key grants access.
 *
 * @example
 * ```ts
 * const allowed = await ctx.runQuery(
 *   components.convexFilesControl.queries.hasAccessKey,
 *   { storageId, accessKey: "user_123" },
 * );
 * ```
 */
export const hasAccessKey = query({
  args: {
    storageId: v.string(),
    accessKey: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return hasAccessKeyForFile(ctx, args);
  },
});
