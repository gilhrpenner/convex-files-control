"use client";

import { useMutation } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useCallback } from "react";
import {
  DEFAULT_PATH_PREFIX,
  buildEndpointUrl,
  uploadFormFields,
} from "../shared";
import type { StorageProvider, UploadResult } from "../shared";

export type UploadMethod = "presigned" | "http";
export type { UploadMetadata, UploadResult } from "../shared";

export type HttpUploadOptions = {
  uploadUrl?: string;
  baseUrl?: string;
  pathPrefix?: string;
};

export type UploadFileArgs = {
  file: File;
  accessKeys: string[];
  expiresAt?: number | null;
  method?: UploadMethod;
  http?: HttpUploadOptions;
  provider?: StorageProvider;
};

export type UseUploadFileOptions = {
  method?: UploadMethod;
  http?: HttpUploadOptions;
  provider?: StorageProvider;
};

export type UploadApi = {
  generateUploadUrl: FunctionReference<"mutation">;
  finalizeUpload: FunctionReference<"mutation">;
};

function resolveUploadUrl(http?: HttpUploadOptions) {
  if (!http) {
    return undefined;
  }

  if (http.uploadUrl) {
    return http.uploadUrl;
  }

  if (!http.baseUrl) {
    return undefined;
  }

  const rawPrefix = http.pathPrefix ?? DEFAULT_PATH_PREFIX;
  return buildEndpointUrl(http.baseUrl, rawPrefix, "upload");
}

/**
 * Upload files from React using either a presigned URL or the HTTP route.
 *
 * @param api - Your component API references for `generateUploadUrl` and `finalizeUpload`.
 * @param options - Default upload settings (method and HTTP config).
 * @returns Helpers for the chosen upload method.
 *
 * @example
 * ```ts
 * import { api } from "../convex/_generated/api";
 * import { useUploadFile } from "@gilhrpenner/convex-files-control/react";
 *
 * const { uploadFile } = useUploadFile(api.filesControl, { method: "presigned" });
 * await uploadFile({ file, accessKeys: ["user_123"] });
 * ```
 */
export function useUploadFile<Api extends UploadApi>(
  api: Api,
  options: UseUploadFileOptions = {},
) {
  const generateUploadUrl = useMutation(api.generateUploadUrl);
  const finalizeUpload = useMutation(api.finalizeUpload);

  const uploadViaPresignedUrl = useCallback(
    async (args: UploadFileArgs): Promise<UploadResult> => {
      const { file, accessKeys, expiresAt } = args;
      const provider = args.provider ?? options.provider ?? "convex";
      const { uploadUrl, uploadToken, storageId: presetStorageId } =
        await generateUploadUrl({ provider });
      const uploadResponse = await fetch(uploadUrl, {
        method: provider === "r2" ? "PUT" : "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }

      let storageId: string | null = presetStorageId ?? null;
      if (provider === "convex") {
        const uploadPayload = (await uploadResponse.json()) as {
          storageId?: string;
        };
        storageId = uploadPayload.storageId ?? null;
      }

      if (!storageId) {
        throw new Error("Upload did not return a storageId.");
      }

      return await finalizeUpload({
        uploadToken,
        storageId,
        accessKeys,
        expiresAt,
      });
    },
    [generateUploadUrl, finalizeUpload, options.provider],
  );

  const uploadViaHttpAction = useCallback(
    async (args: UploadFileArgs): Promise<UploadResult> => {
      const { file, accessKeys, expiresAt } = args;
      const provider = args.provider ?? options.provider ?? "convex";
      const uploadUrl = resolveUploadUrl(args.http ?? options.http);
      if (!uploadUrl) {
        throw new Error(
          "Missing HTTP upload URL. Provide http.uploadUrl or http.baseUrl.",
        );
      }

      const formData = new FormData();
      formData.append(uploadFormFields.file, file);
      formData.append(
        uploadFormFields.accessKeys,
        JSON.stringify(accessKeys),
      );
      formData.append(uploadFormFields.provider, provider);
      if (expiresAt !== undefined) {
        formData.append(
          uploadFormFields.expiresAt,
          expiresAt === null ? "null" : String(expiresAt),
        );
      }

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      let payload: unknown = null;
      try {
        payload = await uploadResponse.json();
      } catch {
        payload = null;
      }

      if (!uploadResponse.ok) {
        const errorMessage =
          typeof (payload as { error?: string })?.error === "string"
            ? (payload as { error?: string }).error
            : "HTTP upload failed.";
        throw new Error(errorMessage);
      }

      return payload as UploadResult;
    },
    [options.http, options.provider],
  );

  const uploadFile = useCallback(
    async (args: UploadFileArgs): Promise<UploadResult> => {
      const method = args.method ?? options.method ?? "presigned";

      if (method === "http") {
        return await uploadViaHttpAction(args);
      }

      return await uploadViaPresignedUrl(args);
    },
    [options.method, uploadViaHttpAction, uploadViaPresignedUrl],
  );

  return { uploadFile, uploadViaPresignedUrl, uploadViaHttpAction };
}
