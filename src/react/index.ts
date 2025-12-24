"use client";

import { useMutation } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useCallback } from "react";

const DEFAULT_PATH_PREFIX = "/files";

export type UploadMethod = "presigned" | "http";

export type UploadMetadata = {
  storageId: string;
  size: number;
  sha256: string;
  contentType: string | null;
};

export type UploadResult = {
  storageId: string;
  expiresAt: number | null;
  metadata: UploadMetadata;
};

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
};

export type UseUploadFileOptions = {
  method?: UploadMethod;
  http?: HttpUploadOptions;
};

export type UploadApi = {
  generateUploadUrl: FunctionReference<"mutation">;
  finalizeUpload: FunctionReference<"mutation">;
};

function resolveUploadUrl(http?: HttpUploadOptions) {
  if (!http) return undefined;
  if (http.uploadUrl) return http.uploadUrl;
  if (!http.baseUrl) return undefined;
  const baseUrl = http.baseUrl.replace(/\/$/, "");
  const rawPrefix = http.pathPrefix ?? DEFAULT_PATH_PREFIX;
  const prefix = rawPrefix.startsWith("/") ? rawPrefix : `/${rawPrefix}`;
  return `${baseUrl}${prefix}/upload`;
}

/**
 * Upload files to Convex storage using either pre-signed URLs or the HTTP action.
 *
 * This hook can be used as is, or copied into your own code for customization
 * and tighter control.
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
      const { uploadUrl, uploadToken } = await generateUploadUrl();
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`);
      }

      const uploadPayload = (await uploadResponse.json()) as {
        storageId?: string;
      };

      if (!uploadPayload.storageId) {
        throw new Error("Upload did not return a storageId.");
      }

      return await finalizeUpload({
        uploadToken,
        storageId: uploadPayload.storageId,
        accessKeys,
        expiresAt,
      });
    },
    [generateUploadUrl, finalizeUpload],
  );

  const uploadViaHttpAction = useCallback(
    async (args: UploadFileArgs): Promise<UploadResult> => {
      const { file, accessKeys, expiresAt } = args;
      const uploadUrl = resolveUploadUrl(args.http ?? options.http);
      if (!uploadUrl) {
        throw new Error(
          "Missing HTTP upload URL. Provide http.uploadUrl or http.baseUrl.",
        );
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("accessKeys", JSON.stringify(accessKeys));
      if (expiresAt !== undefined) {
        formData.append(
          "expiresAt",
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
    [options.http],
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
