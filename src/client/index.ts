import {
  httpActionGeneric,
  mutationGeneric,
  paginationOptsValidator,
  paginationResultValidator,
  queryGeneric,
  type ApiFromModules,
  type GenericActionCtx,
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
import { storageProviderValidator } from "../component/storageProvider";
import {
  DEFAULT_PATH_PREFIX,
  buildEndpointUrl,
  isStorageProvider,
  normalizeBaseUrl,
  normalizePathPrefix,
  uploadFormFields,
} from "../shared";
import type { R2Config, StorageProvider } from "../shared/types";
import {
  corsResponse,
  jsonError,
  jsonSuccess,
  parseOptionalTimestamp,
  sanitizeFilename,
  statusCodeForDownloadError,
  corsHeaders,
} from "./http";

export { uploadFormFields };
export type { StorageProvider, R2Config } from "../shared/types";

export type R2ConfigInput = {
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
};

const R2_ENV_VARS: Record<keyof R2Config, string> = {
  accountId: "R2_ACCOUNT_ID",
  accessKeyId: "R2_ACCESS_KEY_ID",
  secretAccessKey: "R2_SECRET_ACCESS_KEY",
  bucketName: "R2_BUCKET_NAME",
};

const readEnv = (key: string) =>
  typeof process !== "undefined" ? process.env[key] : undefined;

const resolveR2Config = (input?: R2ConfigInput): R2Config | null => {
  const config = {
    accountId: input?.accountId ?? readEnv(R2_ENV_VARS.accountId),
    accessKeyId: input?.accessKeyId ?? readEnv(R2_ENV_VARS.accessKeyId),
    secretAccessKey:
      input?.secretAccessKey ?? readEnv(R2_ENV_VARS.secretAccessKey),
    bucketName: input?.bucketName ?? readEnv(R2_ENV_VARS.bucketName),
  };

  const hasAll = Object.values(config).every((value) => Boolean(value));
  if (!hasAll) {
    return null;
  }

  return config as R2Config;
};

const requireR2Config = (input?: R2ConfigInput, context?: string): R2Config => {
  const config = resolveR2Config(input);
  if (config) {
    return config;
  }

  const missing = Object.entries(R2_ENV_VARS)
    .filter(([key]) => {
      const field = key as keyof R2Config;
      const value = input?.[field] ?? readEnv(R2_ENV_VARS[field]);
      return !value;
    })
    .map(([, envVar]) => envVar);

  const suffix = context ? ` for ${context}` : "";
  const missingText = missing.length > 0 ? ` Missing: ${missing.join(", ")}` : "";
  throw new Error(
    `R2 configuration is missing required fields${suffix}.${missingText}`,
  );
};

export interface RegisterRoutesOptions {
  /** Prefix for HTTP routes, defaults to "/files". */
  pathPrefix?: string;
  /** Require accessKey for downloads (via checkDownloadRequest hook). */
  requireAccessKey?: boolean;
  /**
   * Query parameter name for password. Note: query params can leak into logs or
   * caches; prefer headers or POST flows when possible.
   */
  passwordQueryParam?: string;
  /** Header name for password (preferred over query params). */
  passwordHeader?: string;
  enableUploadRoute?: boolean;
  enableDownloadRoute?: boolean;
  /** Default provider when not supplied in the upload form. */
  defaultUploadProvider?: StorageProvider;
  /** R2 credentials for server-side upload/download/cleanup. */
  r2?: R2ConfigInput;
  /**
   * Required hook for upload authentication when enableUploadRoute is true.
   * Return { accessKeys } to proceed with the upload, or a Response to reject.
   *
   * @example
   * ```ts
   * checkUploadRequest: async (ctx) => {
   *   const userId = await getAuthUserId(ctx);
   *   if (!userId) {
   *     return new Response(JSON.stringify({ error: "Unauthorized" }), {
   *       status: 401,
   *       headers: { "Content-Type": "application/json" },
   *     });
   *   }
   *   return { accessKeys: [userId] };
   * }
   * ```
   */
  checkUploadRequest?: (
    ctx: RunHttpActionCtx,
    args: UploadRequestArgs,
  ) => UploadRequestResult | Promise<UploadRequestResult>;
  /**
   * Optional hook for rate limiting or request validation. Return a Response to
   * short-circuit the request (e.g. 429).
   */
  checkDownloadRequest?: (
    ctx: RunHttpActionCtx,
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
    passwordQueryParam = "password",
    passwordHeader = "x-download-password",
    enableUploadRoute = false,
    enableDownloadRoute = true,
    defaultUploadProvider = "convex",
    r2,
    checkUploadRequest,
    checkDownloadRequest,
  } = options;

  const normalizedPrefix = normalizePathPrefix(pathPrefix);
  const uploadPath = `${normalizedPrefix}/upload`;
  const downloadPath = `${normalizedPrefix}/download`;

  if (enableUploadRoute) {
    if (!checkUploadRequest) {
      throw new Error(
        "checkUploadRequest is required when enableUploadRoute is true. " +
          "This hook must authenticate the request and return { accessKeys }.",
      );
    }

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

        const expiresAt = parseOptionalTimestamp(
          formData.get(uploadFormFields.expiresAt),
        );
        if (expiresAt === "invalid") {
          return jsonError("'expiresAt' must be a number or null", 400);
        }

        const providerRaw = formData.get(uploadFormFields.provider);
        const providerValue =
          typeof providerRaw === "string" ? providerRaw : "";
        const provider = isStorageProvider(providerValue)
          ? providerValue
          : defaultUploadProvider;

        // Call the auth hook to get access keys
        const hookResult = await checkUploadRequest(ctx, {
          file,
          expiresAt: expiresAt ?? undefined,
          provider,
          request,
        });

        // If hook returns a Response, use it (e.g., 401 Unauthorized)
        if (hookResult instanceof Response) {
          return hookResult;
        }

        const { accessKeys } = hookResult;
        if (!accessKeys || accessKeys.length === 0) {
          return jsonError("checkUploadRequest must return accessKeys", 500);
        }

        let r2Config: R2Config | undefined = undefined;
        if (provider === "r2") {
          try {
            r2Config = requireR2Config(r2, "R2 uploads");
          } catch (error) {
            return jsonError(
              error instanceof Error ? error.message : "R2 configuration missing.",
              500,
            );
          }
        }

        const { uploadUrl, uploadToken, storageId: presetStorageId } =
          await ctx.runMutation(component.upload.generateUploadUrl, {
            provider,
            r2Config,
          });

        const uploadResponse = await fetch(uploadUrl, {
          method: provider === "r2" ? "PUT" : "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });

        if (!uploadResponse.ok) {
          return jsonError("File upload failed", 502);
        }

        let storageId = presetStorageId ?? null;
        if (provider === "convex") {
          const uploadPayload = (await uploadResponse.json()) as {
            storageId?: string;
          };
          storageId = uploadPayload.storageId ?? null;
        }

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

        // For downloads, accessKey should come from checkDownloadRequest hook
        let accessKey: string | undefined;

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

        if (requireAccessKey && !accessKey) {
          return jsonError(
            "Missing required accessKey. Provide it via checkDownloadRequest hook.",
            401,
          );
        }

        const result = await ctx.runMutation(
          component.download.consumeDownloadGrantForUrl,
          {
            downloadToken,
            accessKey,
            password,
            r2Config: resolveR2Config(r2) ?? undefined,
          },
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
  storageProvider: StorageProvider;
  expiresAt: number | null;
}) => ({
  _id: asFileId(file._id),
  storageId: file.storageId,
  storageProvider: file.storageProvider,
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

type RunActionCtx = {
  runAction: GenericActionCtx<GenericDataModel>["runAction"];
};

/**
 * Context type for HTTP action hooks. Includes auth for authentication
 * and runMutation for calling component mutations.
 */
export type RunHttpActionCtx = {
  auth: GenericActionCtx<GenericDataModel>["auth"];
  runMutation: GenericActionCtx<GenericDataModel>["runMutation"];
};

type FinalizeUploadArgs = {
  uploadToken: Id<"pendingUploads">;
  storageId: string;
  accessKeys: string[];
  expiresAt?: number | null;
  metadata?: {
    size: number;
    sha256: string;
    contentType: string | null;
  };
};

type RegisterFileArgs = {
  storageId: string;
  storageProvider: StorageProvider;
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
  r2Config?: R2Config;
};

export type UploadRequestArgs = {
  file: Blob;
  expiresAt?: number;
  provider: StorageProvider;
  request: Request;
};

export type UploadRequestResult =
  | { accessKeys: string[] }
  | Response;

export type DownloadRequestArgs = {
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
      storageProvider: StorageProvider;
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
  private r2ConfigInput?: R2ConfigInput;
  private resolvedR2Config: R2Config | null;

  constructor(
    public component: ComponentApi,
    options: { r2?: R2ConfigInput } = {},
  ) {
    this.r2ConfigInput = options.r2;
    this.resolvedR2Config = resolveR2Config(options.r2);
  }

  private maybeR2Config(override?: R2Config) {
    return override ?? this.resolvedR2Config ?? undefined;
  }

  private requireR2Config(context?: string, override?: R2Config) {
    return override ?? requireR2Config(this.r2ConfigInput, context);
  }

  async generateUploadUrl(
    ctx: RunMutationCtx,
    args: { provider?: StorageProvider; r2Config?: R2Config } = {},
  ) {
    const provider = args.provider ?? "convex";
    const r2Config =
      provider === "r2"
        ? this.requireR2Config("R2 uploads", args.r2Config)
        : undefined;
    return ctx.runMutation(this.component.upload.generateUploadUrl, {
      provider,
      r2Config,
    });
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
    const { r2Config, ...rest } = args;
    return ctx.runMutation(this.component.download.consumeDownloadGrantForUrl, {
      ...rest,
      r2Config: this.maybeR2Config(r2Config),
    });
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

  async deleteFile(
    ctx: RunMutationCtx,
    args: { storageId: string; r2Config?: R2Config },
  ) {
    return ctx.runMutation(this.component.cleanUp.deleteFile, {
      storageId: args.storageId,
      r2Config: this.maybeR2Config(args.r2Config),
    });
  }

  async cleanupExpired(
    ctx: RunMutationCtx,
    args: { limit?: number; r2Config?: R2Config },
  ) {
    return ctx.runMutation(this.component.cleanUp.cleanupExpired, {
      limit: args.limit,
      r2Config: this.maybeR2Config(args.r2Config),
    });
  }

  async computeR2Metadata(
    ctx: RunActionCtx,
    args: { storageId: string; r2Config?: R2Config },
  ) {
    const r2Config = this.requireR2Config("R2 metadata", args.r2Config);
    return ctx.runAction(this.component.upload.computeR2Metadata, {
      storageId: args.storageId,
      r2Config,
    });
  }

  async transferFile(
    ctx: RunActionCtx,
    args: { storageId: string; targetProvider: StorageProvider; r2Config?: R2Config },
  ) {
    const r2Config =
      args.targetProvider === "r2"
        ? this.requireR2Config("R2 transfers", args.r2Config)
        : this.maybeR2Config(args.r2Config);
    return ctx.runAction(this.component.transfer.transferFile, {
      storageId: args.storageId,
      targetProvider: args.targetProvider,
      r2Config,
    });
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
        args: {
          provider: storageProviderValidator,
        },
        returns: v.object({
          uploadUrl: v.string(),
          uploadToken: v.id("pendingUploads"),
          uploadTokenExpiresAt: v.number(),
          storageProvider: storageProviderValidator,
          storageId: v.union(v.string(), v.null()),
        }),
        handler: async (ctx, args) => {
          if (opts.checkUpload) {
            await opts.checkUpload(ctx);
          }

          const result = await this.generateUploadUrl(ctx, {
            provider: args.provider,
          });
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
          metadata: v.optional(fileMetadataInputValidator),
        },
        returns: v.object({
          storageId: v.string(),
          storageProvider: storageProviderValidator,
          expiresAt: v.union(v.null(), v.number()),
          metadata: v.union(fileMetadataValidator, v.null()),
        }),
        handler: async (ctx, args) => {
          if (opts.checkUpload) {
            await opts.checkUpload(ctx);
          }

          const result = await this.finalizeUpload(ctx, args);
          const coerced = {
            ...result,
            storageId: result.storageId,
            metadata: result.metadata
              ? {
                  ...result.metadata,
                  storageId: result.metadata.storageId,
                }
              : null,
          };

          if (opts.onUpload) {
            await opts.onUpload(ctx, {
              storageId: args.storageId,
              storageProvider: result.storageProvider,
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
          storageProvider: storageProviderValidator,
          accessKeys: v.array(v.string()),
          expiresAt: v.optional(v.union(v.null(), v.number())),
          metadata: v.optional(fileMetadataInputValidator),
        },
        returns: v.object({
          storageId: v.string(),
          storageProvider: storageProviderValidator,
          expiresAt: v.union(v.null(), v.number()),
          metadata: v.union(fileMetadataValidator, v.null()),
        }),
        handler: async (ctx, args) => {
          if (opts.checkUpload) {
            await opts.checkUpload(ctx);
          }

          const result = await this.registerFile(ctx, args);
          const coerced = {
            ...result,
            storageId: result.storageId,
            metadata: result.metadata
              ? {
                  ...result.metadata,
                  storageId: result.metadata.storageId,
                }
              : null,
          };

          if (opts.onUpload) {
            await opts.onUpload(ctx, {
              storageId: args.storageId,
              storageProvider: args.storageProvider,
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
