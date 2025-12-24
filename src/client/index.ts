import { httpActionGeneric, mutationGeneric, queryGeneric } from "convex/server";
import type { Auth, HttpRouter } from "convex/server";
import { v } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";

export type AuthOperation =
  | { type: "generateUploadUrl" }
  | { type: "finalizeUpload"; storageId: string; accessKeys: string[] }
  | { type: "registerFile"; storageId: string; accessKeys: string[] }
  | { type: "createDownloadGrant"; storageId: string }
  | { type: "consumeDownloadGrantForUrl"; downloadToken: string }
  | { type: "cleanupExpired" }
  | { type: "deleteFile"; storageId: string }
  | { type: "addAccessKey"; storageId: string; accessKey: string }
  | { type: "removeAccessKey"; storageId: string; accessKey: string }
  | { type: "updateFileExpiration"; storageId: string }
  | { type: "listFiles" }
  | { type: "listFilesByAccessKey"; accessKey: string }
  | { type: "getFile"; storageId: string }
  | { type: "listAccessKeys"; storageId: string }
  | { type: "listDownloadGrants" }
  | { type: "hasAccessKey"; storageId: string; accessKey: string };

export function exposeApi(
  component: ComponentApi,
  options: {
    auth: (ctx: { auth: Auth }, operation: AuthOperation) => Promise<void>;
  },
) {
  return {
    generateUploadUrl: mutationGeneric({
      args: {},
      handler: async (ctx) => {
        await options.auth(ctx, { type: "generateUploadUrl" });
        return await ctx.runMutation(component.upload.generateUploadUrl, {});
      },
    }),
    finalizeUpload: mutationGeneric({
      args: {
        uploadToken: v.string(),
        storageId: v.string(),
        accessKeys: v.array(v.string()),
        expiresAt: v.optional(v.union(v.null(), v.number())),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "finalizeUpload",
          storageId: args.storageId,
          accessKeys: args.accessKeys,
        });
        return await ctx.runMutation(component.upload.finalizeUpload, args);
      },
    }),
    registerFile: mutationGeneric({
      args: {
        storageId: v.string(),
        accessKeys: v.array(v.string()),
        expiresAt: v.optional(v.union(v.null(), v.number())),
        metadata: v.optional(
          v.object({
            size: v.number(),
            sha256: v.string(),
            contentType: v.union(v.string(), v.null()),
          }),
        ),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "registerFile",
          storageId: args.storageId,
          accessKeys: args.accessKeys,
        });
        return await ctx.runMutation(component.upload.registerFile, args);
      },
    }),
    createDownloadGrant: mutationGeneric({
      args: {
        storageId: v.string(),
        maxUses: v.optional(v.union(v.null(), v.number())),
        expiresAt: v.optional(v.union(v.null(), v.number())),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "createDownloadGrant",
          storageId: args.storageId,
        });
        return await ctx.runMutation(
          component.download.createDownloadGrant,
          args,
        );
      },
    }),
    consumeDownloadGrantForUrl: mutationGeneric({
      args: {
        downloadToken: v.string(),
        accessKey: v.optional(v.string()),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "consumeDownloadGrantForUrl",
          downloadToken: args.downloadToken,
        });
        return await ctx.runMutation(
          component.download.consumeDownloadGrantForUrl,
          args,
        );
      },
    }),
    cleanupExpired: mutationGeneric({
      args: {
        limit: v.optional(v.number()),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, { type: "cleanupExpired" });
        return await ctx.runMutation(component.cleanUp.cleanupExpired, args);
      },
    }),
    deleteFile: mutationGeneric({
      args: {
        storageId: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, { type: "deleteFile", storageId: args.storageId });
        return await ctx.runMutation(component.cleanUp.deleteFile, args);
      },
    }),
    addAccessKey: mutationGeneric({
      args: {
        storageId: v.string(),
        accessKey: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "addAccessKey",
          storageId: args.storageId,
          accessKey: args.accessKey,
        });
        return await ctx.runMutation(component.accessControl.addAccessKey, args);
      },
    }),
    removeAccessKey: mutationGeneric({
      args: {
        storageId: v.string(),
        accessKey: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "removeAccessKey",
          storageId: args.storageId,
          accessKey: args.accessKey,
        });
        return await ctx.runMutation(component.accessControl.removeAccessKey, args);
      },
    }),
    updateFileExpiration: mutationGeneric({
      args: {
        storageId: v.string(),
        expiresAt: v.union(v.null(), v.number()),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, { type: "updateFileExpiration", storageId: args.storageId });
        return await ctx.runMutation(component.accessControl.updateFileExpiration, args);
      },
    }),
    listFiles: queryGeneric({
      args: {},
      handler: async (ctx, args) => {
        await options.auth(ctx, { type: "listFiles" });
        return await ctx.runQuery(component.queries.listFiles, args);
      },
    }),
    listFilesByAccessKey: queryGeneric({
      args: {
        accessKey: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, { type: "listFilesByAccessKey", accessKey: args.accessKey });
        return await ctx.runQuery(component.queries.listFilesByAccessKey, args);
      },
    }),
    getFile: queryGeneric({
      args: {
        storageId: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, { type: "getFile", storageId: args.storageId });
        return await ctx.runQuery(component.queries.getFile, args);
      },
    }),
    listAccessKeys: queryGeneric({
      args: {
        storageId: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, { type: "listAccessKeys", storageId: args.storageId });
        return await ctx.runQuery(component.queries.listAccessKeys, args);
      },
    }),
    listDownloadGrants: queryGeneric({
      args: {},
      handler: async (ctx) => {
        await options.auth(ctx, { type: "listDownloadGrants" });
        return await ctx.runQuery(component.queries.listDownloadGrants, {});
      },
    }),
    hasAccessKey: queryGeneric({
      args: {
        storageId: v.string(),
        accessKey: v.string(),
      },
      handler: async (ctx, args) => {
        await options.auth(ctx, {
          type: "hasAccessKey",
          storageId: args.storageId,
          accessKey: args.accessKey,
        });
        return await ctx.runQuery(component.queries.hasAccessKey, args);
      },
    }),
  };
}

const DEFAULT_PATH_PREFIX = "/files";

export const uploadFormFields = {
  file: "file",
  accessKeys: "accessKeys",
  expiresAt: "expiresAt",
} as const;

export interface RegisterRoutesOptions {
  pathPrefix?: string;
  requireAccessKey?: boolean;
  accessKeyQueryParam?: string;
}

export function registerRoutes(
  http: HttpRouter,
  component: ComponentApi,
  options: RegisterRoutesOptions = {},
) {
  const {
    pathPrefix = DEFAULT_PATH_PREFIX,
    requireAccessKey = false,
    accessKeyQueryParam = "accessKey",
  } = options;

  const uploadPath = `${pathPrefix}/upload`;
  const downloadPath = `${pathPrefix}/download`;

  http.route({
    path: uploadPath,
    method: "OPTIONS",
    handler: httpActionGeneric(async () => corsResponse()),
  });

  http.route({
    path: downloadPath,
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

      const result = await ctx.runMutation(
        component.download.consumeDownloadGrantForUrl,
        { downloadToken, accessKey },
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
      if (ct) headers.set("Content-Type", ct);

      const cl = fileResponse.headers.get("Content-Length");
      if (cl) headers.set("Content-Length", cl);

      return new Response(fileResponse.body, { status: 200, headers });
    }),
  });
}

export interface BuildDownloadUrlOptions {
  baseUrl: string;
  downloadToken: string;
  pathPrefix?: string;
  accessKey?: string;
  filename?: string;
}

export function buildDownloadUrl({
  baseUrl,
  downloadToken,
  pathPrefix = DEFAULT_PATH_PREFIX,
  accessKey,
  filename,
}: BuildDownloadUrlOptions): string {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const params = new URLSearchParams({ token: downloadToken });
  if (accessKey) params.set("accessKey", accessKey);
  if (filename) params.set("filename", filename);
  return `${normalizedBase}${pathPrefix}/download?${params.toString()}`;
}

function corsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
}

function corsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function jsonSuccess(data: unknown): Response {
  const headers = corsHeaders();
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { status: 200, headers });
}

function jsonError(message: string, status: number): Response {
  const headers = corsHeaders();
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ error: message }), { status, headers });
}

function parseJsonStringArray(value: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function parseOptionalTimestamp(
  value: FormDataEntryValue | null,
): number | null | undefined | "invalid" {
  if (value === null) return undefined;
  if (typeof value !== "string") return "invalid";
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "null") return null;
  const num = Number(trimmed);
  return Number.isNaN(num) ? "invalid" : num;
}

function sanitizeFilename(value: string | null): string {
  if (!value) return "download";
  const clean = value.trim().replace(/[^A-Za-z0-9._-]/g, "_");
  return clean || "download";
}

function statusCodeForDownloadError(
  status: "expired" | "exhausted" | "file_expired" | "access_denied" | string,
): number {
  switch (status) {
    case "expired":
    case "exhausted":
    case "file_expired":
      return 410;
    case "access_denied":
      return 403;
    default:
      return 404;
  }
}
