import {
  httpActionGeneric,
  mutationGeneric,
  paginationOptsValidator,
  paginationResultValidator,
  queryGeneric,
  type ApiFromModules,
  type GenericDataModel,
  type GenericMutationCtx,
  type GenericQueryCtx,
  type HttpRouter,
  type PaginationOptions,
} from "convex/server";
import { v } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import type { Id } from "../component/_generated/dataModel.js";
import {
  downloadConsumeStatusValidator,
  downloadGrantSummaryValidator,
  fileMetadataInputValidator,
  fileMetadataValidator,
  fileSummaryValidator,
} from "../component/validators";
import {
  DEFAULT_PATH_PREFIX,
  buildEndpointUrl,
  normalizeBaseUrl,
  normalizePathPrefix,
  uploadFormFields,
} from "../shared";
import {
  corsResponse,
  jsonError,
  jsonSuccess,
  parseJsonStringArray,
  parseOptionalTimestamp,
  sanitizeFilename,
  statusCodeForDownloadError,
  corsHeaders,
} from "./http";

export { uploadFormFields };

export interface RegisterRoutesOptions {
  /** Prefix for HTTP routes, defaults to "/files". */
  pathPrefix?: string;
  /** Require accessKey query param for downloads. */
  requireAccessKey?: boolean;
  /** Query parameter name for accessKey. */
  accessKeyQueryParam?: string;
  /**
   * Query parameter name for password. Note: query params can leak into logs or
   * caches; prefer headers or POST flows when possible.
   */
  passwordQueryParam?: string;
  /** Header name for password (preferred over query params). */
  passwordHeader?: string;
  enableUploadRoute?: boolean;
  enableDownloadRoute?: boolean;
  /**
   * Optional hook for rate limiting or request validation. Return a Response to
   * short-circuit the request (e.g. 429).
   */
  checkDownloadRequest?: (
    ctx: RunMutationCtx,
    args: DownloadRequestArgs,
  ) => void | Response | Promise<void | Response>;
}

/**
 * Register HTTP routes for upload and download endpoints.
 *
 * Note: Passing passwords via query parameters can expose them in logs or
 * caches. Prefer a header (e.g. `x-download-password`) or a POST-based flow
 * when possible.
 *
 * @param http - Your Convex `HttpRouter`.
 * @param component - The configured component API reference.
 * @param options - Route behavior and path configuration.
 *
 * @example
 * ```ts
 * import { httpRouter } from "convex/server";
 * import { components } from "./_generated/api";
 * import { registerRoutes } from "@gilhrpenner/convex-files-control";
 *
 * const http = httpRouter();
 * registerRoutes(http, components.convexFilesControl, {
 *   enableUploadRoute: true,
 *   enableDownloadRoute: true,
 *   pathPrefix: "/files",
 * });
 * export default http;
 * ```
 */
export function registerRoutes(
  http: HttpRouter,
  component: ComponentApi,
  options: RegisterRoutesOptions = {},
) {
  const {
    pathPrefix = DEFAULT_PATH_PREFIX,
    requireAccessKey = false,
    accessKeyQueryParam = "accessKey",
    passwordQueryParam = "password",
    passwordHeader = "x-download-password",
    enableUploadRoute = false,
    enableDownloadRoute = true,
    checkDownloadRequest,
  } = options;

  const normalizedPrefix = normalizePathPrefix(pathPrefix);
  const uploadPath = `${normalizedPrefix}/upload`;
  const downloadPath = `${normalizedPrefix}/download`;

  if (enableUploadRoute) {
    http.route({
      path: uploadPath,
      method: "OPTIONS",
      handler: httpActionGeneric(async () => corsResponse()),
    });

    http.route({
      path: uploadPath,
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const contentType = request.headers.get("Content-Type") ?? "";
        if (!contentType.includes("multipart/form-data")) {
          return jsonError("Content-Type must be multipart/form-data", 415);
        }

        const formData = await request.formData();
        const file = formData.get(uploadFormFields.file);
        if (!(file instanceof Blob)) {
          return jsonError("Missing or invalid 'file' field", 400);
        }

        const accessKeysRaw = formData.get(uploadFormFields.accessKeys);
        if (typeof accessKeysRaw !== "string") {
          return jsonError("Missing 'accessKeys' field", 400);
        }

        const accessKeys = parseJsonStringArray(accessKeysRaw);
        if (!accessKeys) {
          return jsonError("'accessKeys' must be a JSON array of strings", 400);
        }

        const expiresAt = parseOptionalTimestamp(
          formData.get(uploadFormFields.expiresAt),
        );
        if (expiresAt === "invalid") {
          return jsonError("'expiresAt' must be a number or null", 400);
        }

        const { uploadUrl, uploadToken } = await ctx.runMutation(
          component.upload.generateUploadUrl,
          {},
        );

        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });

        if (!uploadResponse.ok) {
          return jsonError("File upload failed", 502);
        }

        const uploadPayload = (await uploadResponse.json()) as {
          storageId?: string;
        };
        const storageId = uploadPayload.storageId;
        if (!storageId) {
          return jsonError("Upload did not return storageId", 502);
        }

        const result = await ctx.runMutation(component.upload.finalizeUpload, {
          uploadToken,
          storageId,
          accessKeys,
          expiresAt: expiresAt ?? undefined,
        });

        return jsonSuccess(result);
      }),
    });
  }

  if (enableDownloadRoute) {
    http.route({
      path: downloadPath,
      method: "OPTIONS",
      handler: httpActionGeneric(async () => corsResponse()),
    });

    http.route({
      path: downloadPath,
      method: "GET",
      handler: httpActionGeneric(async (ctx, request) => {
        const url = new URL(request.url);
        const downloadToken = url.searchParams.get("token");
        if (!downloadToken) {
          return jsonError("Missing 'token' query parameter", 400);
        }

        const accessKey = url.searchParams.get(accessKeyQueryParam) ?? undefined;
        if (requireAccessKey && !accessKey) {
          return jsonError("Missing required accessKey", 401);
        }

        const passwordFromHeader = passwordHeader
          ? request.headers.get(passwordHeader)
          : null;
        const passwordFromQuery = passwordQueryParam
          ? url.searchParams.get(passwordQueryParam)
          : null;
        const password = passwordFromHeader ?? passwordFromQuery ?? undefined;

        if (checkDownloadRequest) {
          const result = await checkDownloadRequest(ctx, {
            downloadToken,
            accessKey,
            password,
            request,
          });
          if (result instanceof Response) {
            return result;
          }
        }

        const result = await ctx.runMutation(
          component.download.consumeDownloadGrantForUrl,
          { downloadToken, accessKey, password },
        );

        if (result.status !== "ok" || !result.downloadUrl) {
          return jsonError(
            "Download unavailable",
            statusCodeForDownloadError(result.status),
          );
        }

        const fileResponse = await fetch(result.downloadUrl);
        if (!fileResponse.ok || !fileResponse.body) {
          return jsonError("File not available", 404);
        }

        const filename = sanitizeFilename(url.searchParams.get("filename"));
        const headers = corsHeaders();
        headers.set("Cache-Control", "no-store");
        headers.set("Content-Disposition", `attachment; filename="${filename}"`);

        const ct = fileResponse.headers.get("Content-Type");
        if (ct) {
          headers.set("Content-Type", ct);
        }

        const cl = fileResponse.headers.get("Content-Length");
        if (cl) {
          headers.set("Content-Length", cl);
        }

        return new Response(fileResponse.body, { status: 200, headers });
      }),
    });
  }
}

export interface BuildDownloadUrlOptions {
  baseUrl: string;
  downloadToken: string;
  pathPrefix?: string;
  accessKey?: string;
  filename?: string;
}

/**
 * Build a download URL for the HTTP route.
 *
 * @param options - Base URL, token, and optional query parameters.
 * @returns A fully qualified URL for the download route.
 *
 * Note: Avoid placing passwords in query params; they can leak into logs or
 * caches. Prefer headers or POST flows when possible.
 *
 * @example
 * ```ts
 * const url = buildDownloadUrl({
 *   baseUrl: "https://your-app.convex.site",
 *   downloadToken,
 *   accessKey: "user_123",
 *   filename: "report.pdf",
 * });
 * ```
 */
export function buildDownloadUrl({
  baseUrl,
  downloadToken,
  pathPrefix = DEFAULT_PATH_PREFIX,
  accessKey,
  filename,
}: BuildDownloadUrlOptions): string {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const endpoint = buildEndpointUrl(
    normalizedBase,
    pathPrefix,
    "download",
  );
  const params = new URLSearchParams({ token: downloadToken });
  if (accessKey) params.set("accessKey", accessKey);
  if (filename) params.set("filename", filename);
  return `${endpoint}?${params.toString()}`;
}

const asFileId = (value: string) => value as Id<"files">;
const asDownloadGrantId = (value: string) => value as Id<"downloadGrants">;
const asPendingUploadId = (value: string) => value as Id<"pendingUploads">;

const toFileSummary = (file: {
  _id: string;
  storageId: string;
  expiresAt: number | null;
}) => ({
  _id: asFileId(file._id),
  storageId: file.storageId,
  expiresAt: file.expiresAt,
});

const toDownloadGrantSummary = (grant: {
  _id: string;
  storageId: string;
  expiresAt: number | null;
  maxUses: number | null;
  useCount: number;
  hasPassword: boolean;
}) => ({
  _id: asDownloadGrantId(grant._id),
  storageId: grant.storageId,
  expiresAt: grant.expiresAt,
  maxUses: grant.maxUses,
  useCount: grant.useCount,
  hasPassword: grant.hasPassword,
});

export type ClientApi = ApiFromModules<{
  client: ReturnType<FilesControl["clientApi"]>;
}>["client"];

type RunQueryCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
};

type RunMutationCtx = {
  runMutation: GenericMutationCtx<GenericDataModel>["runMutation"];
};

type FinalizeUploadArgs = {
  uploadToken: Id<"pendingUploads">;
  storageId: string;
  accessKeys: string[];
  expiresAt?: number | null;
};

type RegisterFileArgs = {
  storageId: string;
  accessKeys: string[];
  expiresAt?: number | null;
  metadata?: {
    size: number;
    sha256: string;
    contentType: string | null;
  };
};

type DownloadGrantArgs = {
  storageId: string;
  maxUses?: number | null;
  expiresAt?: number | null;
  password?: string;
};

type DownloadConsumeArgs = {
  downloadToken: Id<"downloadGrants">;
  accessKey?: string;
  password?: string;
};

type DownloadRequestArgs = {
  downloadToken: string;
  accessKey?: string;
  password?: string;
  request: Request;
};

type AccessKeyArgs = {
  storageId: string;
  accessKey: string;
};

export type FilesControlHooks<DataModel extends GenericDataModel> = {
  checkUpload?: (
    ctx: GenericMutationCtx<DataModel>,
  ) => void | Promise<void>;
  checkFileMutation?: (
    ctx: GenericMutationCtx<DataModel>,
    storageId: string,
  ) => void | Promise<void>;
  checkAccessKeyMutation?: (
    ctx: GenericMutationCtx<DataModel>,
    args: AccessKeyArgs,
  ) => void | Promise<void>;
  checkDownloadConsume?: (
    ctx: GenericMutationCtx<DataModel>,
    args: DownloadConsumeArgs,
  ) => void | Promise<void>;
  checkMaintenance?: (
    ctx: GenericMutationCtx<DataModel>,
  ) => void | Promise<void>;
  checkReadFile?: (
    ctx: GenericQueryCtx<DataModel>,
    storageId: string,
  ) => void | Promise<void>;
  checkReadAccessKey?: (
    ctx: GenericQueryCtx<DataModel>,
    accessKey: string,
  ) => void | Promise<void>;
  checkListFiles?: (
    ctx: GenericQueryCtx<DataModel>,
  ) => void | Promise<void>;
  checkListDownloadGrants?: (
    ctx: GenericQueryCtx<DataModel>,
  ) => void | Promise<void>;
  onUpload?: (
    ctx: GenericMutationCtx<DataModel>,
    args: {
      storageId: string;
      accessKeys: string[];
      expiresAt?: number | null;
    },
  ) => void | Promise<void>;
  onDelete?: (
    ctx: GenericMutationCtx<DataModel>,
    storageId: string,
  ) => void | Promise<void>;
  onAccessKeyAdded?: (
    ctx: GenericMutationCtx<DataModel>,
    args: AccessKeyArgs,
  ) => void | Promise<void>;
  onAccessKeyRemoved?: (
    ctx: GenericMutationCtx<DataModel>,
    args: AccessKeyArgs,
  ) => void | Promise<void>;
  onDownloadGrantCreated?: (
    ctx: GenericMutationCtx<DataModel>,
    args: {
      storageId: string;
      downloadToken: Id<"downloadGrants">;
    },
  ) => void | Promise<void>;
  onDownloadConsumed?: (
    ctx: GenericMutationCtx<DataModel>,
    args: {
      downloadToken: Id<"downloadGrants">;
      status: string;
      downloadUrl?: string;
    },
  ) => void | Promise<void>;
  onExpirationUpdated?: (
    ctx: GenericMutationCtx<DataModel>,
    args: {
      storageId: string;
      expiresAt: number | null;
    },
  ) => void | Promise<void>;
};

/**
 * Server-side helper for interacting with the component API.
 *
 * Use this in mutations/actions to keep call sites concise and to optionally
 * attach hook callbacks via `clientApi`.
 *
 * @example
 * ```ts
 * const files = new FilesControl(components.convexFilesControl);
 * const page = await files.listFilesPage(ctx, {
 *   paginationOpts: { numItems: 25, cursor: null },
 * });
 * ```
 */
export class FilesControl {
  constructor(public component: ComponentApi) {}

  async generateUploadUrl(ctx: RunMutationCtx) {
    return ctx.runMutation(this.component.upload.generateUploadUrl, {});
  }

  async finalizeUpload(ctx: RunMutationCtx, args: FinalizeUploadArgs) {
    return ctx.runMutation(this.component.upload.finalizeUpload, args);
  }

  async registerFile(ctx: RunMutationCtx, args: RegisterFileArgs) {
    return ctx.runMutation(this.component.upload.registerFile, args);
  }

  async createDownloadGrant(ctx: RunMutationCtx, args: DownloadGrantArgs) {
    return ctx.runMutation(this.component.download.createDownloadGrant, args);
  }

  async consumeDownloadGrantForUrl(
    ctx: RunMutationCtx,
    args: DownloadConsumeArgs,
  ) {
    return ctx.runMutation(
      this.component.download.consumeDownloadGrantForUrl,
      args,
    );
  }

  async addAccessKey(ctx: RunMutationCtx, args: AccessKeyArgs) {
    return ctx.runMutation(this.component.accessControl.addAccessKey, args);
  }

  async removeAccessKey(ctx: RunMutationCtx, args: AccessKeyArgs) {
    return ctx.runMutation(this.component.accessControl.removeAccessKey, args);
  }

  async updateFileExpiration(
    ctx: RunMutationCtx,
    args: { storageId: string; expiresAt: number | null },
  ) {
    return ctx.runMutation(this.component.accessControl.updateFileExpiration, args);
  }

  async deleteFile(ctx: RunMutationCtx, args: { storageId: string }) {
    return ctx.runMutation(this.component.cleanUp.deleteFile, args);
  }

  async cleanupExpired(ctx: RunMutationCtx, args: { limit?: number }) {
    return ctx.runMutation(this.component.cleanUp.cleanupExpired, args);
  }

  async getFile(ctx: RunQueryCtx, args: { storageId: string }) {
    return ctx.runQuery(this.component.queries.getFile, args);
  }

  async listFilesPage(
    ctx: RunQueryCtx,
    args: { paginationOpts: PaginationOptions },
  ) {
    return ctx.runQuery(this.component.queries.listFilesPage, args);
  }

  async listFilesByAccessKeyPage(
    ctx: RunQueryCtx,
    args: { accessKey: string; paginationOpts: PaginationOptions },
  ) {
    return ctx.runQuery(this.component.queries.listFilesByAccessKeyPage, args);
  }

  async listAccessKeysPage(
    ctx: RunQueryCtx,
    args: { storageId: string; paginationOpts: PaginationOptions },
  ) {
    return ctx.runQuery(this.component.queries.listAccessKeysPage, args);
  }

  async listDownloadGrantsPage(
    ctx: RunQueryCtx,
    args: { paginationOpts: PaginationOptions },
  ) {
    return ctx.runQuery(this.component.queries.listDownloadGrantsPage, args);
  }

  async hasAccessKey(
    ctx: RunQueryCtx,
    args: { storageId: string; accessKey: string },
  ) {
    return ctx.runQuery(this.component.queries.hasAccessKey, args);
  }

  clientApi<DataModel extends GenericDataModel>(
    opts: FilesControlHooks<DataModel> = {},
  ) {
    return {
      generateUploadUrl: mutationGeneric({
        args: {},
        returns: v.object({
          uploadUrl: v.string(),
          uploadToken: v.id("pendingUploads"),
          uploadTokenExpiresAt: v.number(),
        }),
        handler: async (ctx) => {
          if (opts.checkUpload) {
            await opts.checkUpload(ctx);
          }

          const result = await this.generateUploadUrl(ctx);
          return {
            ...result,
            uploadToken: asPendingUploadId(result.uploadToken),
          };
        },
      }),
      finalizeUpload: mutationGeneric({
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
          if (opts.checkUpload) {
            await opts.checkUpload(ctx);
          }

          const result = await this.finalizeUpload(ctx, args);
          const coerced = {
            ...result,
            storageId: result.storageId,
            metadata: {
              ...result.metadata,
              storageId: result.metadata.storageId,
            },
          };

          if (opts.onUpload) {
            await opts.onUpload(ctx, {
              storageId: args.storageId,
              accessKeys: args.accessKeys,
              expiresAt: args.expiresAt ?? null,
            });
          }

          return coerced;
        },
      }),
      registerFile: mutationGeneric({
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
          if (opts.checkUpload) {
            await opts.checkUpload(ctx);
          }

          const result = await this.registerFile(ctx, args);
          const coerced = {
            ...result,
            storageId: result.storageId,
            metadata: {
              ...result.metadata,
              storageId: result.metadata.storageId,
            },
          };

          if (opts.onUpload) {
            await opts.onUpload(ctx, {
              storageId: args.storageId,
              accessKeys: args.accessKeys,
              expiresAt: args.expiresAt ?? null,
            });
          }

          return coerced;
        },
      }),
      createDownloadGrant: mutationGeneric({
        args: {
          storageId: v.string(),
          maxUses: v.optional(v.union(v.null(), v.number())),
          expiresAt: v.optional(v.union(v.null(), v.number())),
          password: v.optional(v.string()),
        },
        returns: v.object({
          downloadToken: v.id("downloadGrants"),
          storageId: v.string(),
          expiresAt: v.union(v.null(), v.number()),
          maxUses: v.union(v.null(), v.number()),
        }),
        handler: async (ctx, args) => {
          if (opts.checkFileMutation) {
            await opts.checkFileMutation(ctx, args.storageId);
          }

          const result = await this.createDownloadGrant(ctx, args);
          const coerced = {
            ...result,
            storageId: result.storageId,
            downloadToken: asDownloadGrantId(result.downloadToken),
          };

          if (opts.onDownloadGrantCreated) {
            await opts.onDownloadGrantCreated(ctx, {
              storageId: args.storageId,
              downloadToken: coerced.downloadToken,
            });
          }

          return coerced;
        },
      }),
      consumeDownloadGrantForUrl: mutationGeneric({
        args: {
          downloadToken: v.id("downloadGrants"),
          accessKey: v.optional(v.string()),
          password: v.optional(v.string()),
        },
        returns: v.object({
          status: downloadConsumeStatusValidator,
          downloadUrl: v.optional(v.string()),
        }),
        handler: async (ctx, args) => {
          if (opts.checkDownloadConsume) {
            await opts.checkDownloadConsume(ctx, args);
          }

          const result = await this.consumeDownloadGrantForUrl(ctx, args);
          if (opts.onDownloadConsumed) {
            await opts.onDownloadConsumed(ctx, {
              downloadToken: args.downloadToken,
              status: result.status,
              downloadUrl: result.downloadUrl,
            });
          }

          return result;
        },
      }),
      addAccessKey: mutationGeneric({
        args: {
          storageId: v.string(),
          accessKey: v.string(),
        },
        returns: v.object({
          accessKey: v.string(),
        }),
        handler: async (ctx, args) => {
          if (opts.checkFileMutation) {
            await opts.checkFileMutation(ctx, args.storageId);
          }
          if (opts.checkAccessKeyMutation) {
            await opts.checkAccessKeyMutation(ctx, args);
          }

          const result = await this.addAccessKey(ctx, args);
          if (opts.onAccessKeyAdded) {
            await opts.onAccessKeyAdded(ctx, args);
          }

          return result;
        },
      }),
      removeAccessKey: mutationGeneric({
        args: {
          storageId: v.string(),
          accessKey: v.string(),
        },
        returns: v.object({
          removed: v.boolean(),
        }),
        handler: async (ctx, args) => {
          if (opts.checkFileMutation) {
            await opts.checkFileMutation(ctx, args.storageId);
          }
          if (opts.checkAccessKeyMutation) {
            await opts.checkAccessKeyMutation(ctx, args);
          }

          const result = await this.removeAccessKey(ctx, args);
          if (opts.onAccessKeyRemoved) {
            await opts.onAccessKeyRemoved(ctx, args);
          }

          return result;
        },
      }),
      updateFileExpiration: mutationGeneric({
        args: {
          storageId: v.string(),
          expiresAt: v.union(v.null(), v.number()),
        },
        returns: v.object({
          expiresAt: v.union(v.null(), v.number()),
        }),
        handler: async (ctx, args) => {
          if (opts.checkFileMutation) {
            await opts.checkFileMutation(ctx, args.storageId);
          }

          const result = await this.updateFileExpiration(ctx, args);
          if (opts.onExpirationUpdated) {
            await opts.onExpirationUpdated(ctx, {
              storageId: args.storageId,
              expiresAt: result.expiresAt,
            });
          }

          return result;
        },
      }),
      deleteFile: mutationGeneric({
        args: {
          storageId: v.string(),
        },
        returns: v.object({
          deleted: v.boolean(),
        }),
        handler: async (ctx, args) => {
          if (opts.checkFileMutation) {
            await opts.checkFileMutation(ctx, args.storageId);
          }

          const result = await this.deleteFile(ctx, args);
          if (result.deleted && opts.onDelete) {
            await opts.onDelete(ctx, args.storageId);
          }

          return result;
        },
      }),
      cleanupExpired: mutationGeneric({
        args: {
          limit: v.optional(v.number()),
        },
        returns: v.object({
          deletedCount: v.number(),
          hasMore: v.boolean(),
        }),
        handler: async (ctx, args) => {
          if (opts.checkMaintenance) {
            await opts.checkMaintenance(ctx);
          }

          return this.cleanupExpired(ctx, args);
        },
      }),
      getFile: queryGeneric({
        args: {
          storageId: v.string(),
        },
        returns: v.union(fileSummaryValidator, v.null()),
        handler: async (ctx, args) => {
          if (opts.checkReadFile) {
            await opts.checkReadFile(ctx, args.storageId);
          }

          const result = await this.getFile(ctx, args);
          return result ? toFileSummary(result) : null;
        },
      }),
      listFilesPage: queryGeneric({
        args: {
          paginationOpts: paginationOptsValidator,
        },
        returns: paginationResultValidator(fileSummaryValidator),
        handler: async (ctx, args) => {
          if (opts.checkListFiles) {
            await opts.checkListFiles(ctx);
          }

          const result = await this.listFilesPage(ctx, args);
          return {
            ...result,
            page: result.page.map(toFileSummary),
          };
        },
      }),
      listFilesByAccessKeyPage: queryGeneric({
        args: {
          accessKey: v.string(),
          paginationOpts: paginationOptsValidator,
        },
        returns: paginationResultValidator(fileSummaryValidator),
        handler: async (ctx, args) => {
          if (opts.checkReadAccessKey) {
            await opts.checkReadAccessKey(ctx, args.accessKey);
          }

          const result = await this.listFilesByAccessKeyPage(ctx, args);
          return {
            ...result,
            page: result.page.map(toFileSummary),
          };
        },
      }),
      listAccessKeysPage: queryGeneric({
        args: {
          storageId: v.string(),
          paginationOpts: paginationOptsValidator,
        },
        returns: paginationResultValidator(v.string()),
        handler: async (ctx, args) => {
          if (opts.checkReadFile) {
            await opts.checkReadFile(ctx, args.storageId);
          }

          return this.listAccessKeysPage(ctx, args);
        },
      }),
      listDownloadGrantsPage: queryGeneric({
        args: {
          paginationOpts: paginationOptsValidator,
        },
        returns: paginationResultValidator(downloadGrantSummaryValidator),
        handler: async (ctx, args) => {
          if (opts.checkListDownloadGrants) {
            await opts.checkListDownloadGrants(ctx);
          }

          const result = await this.listDownloadGrantsPage(ctx, args);
          return {
            ...result,
            page: result.page.map(toDownloadGrantSummary),
          };
        },
      }),
      hasAccessKey: queryGeneric({
        args: {
          storageId: v.string(),
          accessKey: v.string(),
        },
        returns: v.boolean(),
        handler: async (ctx, args) => {
          if (opts.checkReadFile) {
            await opts.checkReadFile(ctx, args.storageId);
          }

          return this.hasAccessKey(ctx, args);
        },
      }),
    };
  }
}
