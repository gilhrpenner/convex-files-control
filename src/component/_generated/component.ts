/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    accessControl: {
      addAccessKey: FunctionReference<
        "mutation",
        "internal",
        { accessKey: string; storageId: string },
        { accessKey: string },
        Name
      >;
      removeAccessKey: FunctionReference<
        "mutation",
        "internal",
        { accessKey: string; storageId: string },
        { removed: boolean },
        Name
      >;
      updateFileExpiration: FunctionReference<
        "mutation",
        "internal",
        { expiresAt: null | number; storageId: string },
        { expiresAt: null | number },
        Name
      >;
    };
    cleanUp: {
      cleanupExpired: FunctionReference<
        "mutation",
        "internal",
        {
          limit?: number;
          r2Config?: {
            accessKeyId: string;
            accountId: string;
            bucketName: string;
            secretAccessKey: string;
          };
        },
        { deletedCount: number; hasMore: boolean },
        Name
      >;
      deleteFile: FunctionReference<
        "mutation",
        "internal",
        {
          r2Config?: {
            accessKeyId: string;
            accountId: string;
            bucketName: string;
            secretAccessKey: string;
          };
          storageId: string;
        },
        { deleted: boolean },
        Name
      >;
      deleteStorageFile: FunctionReference<
        "action",
        "internal",
        {
          r2Config?: {
            accessKeyId: string;
            accountId: string;
            bucketName: string;
            secretAccessKey: string;
          };
          storageId: string;
          storageProvider: "convex" | "r2";
        },
        null,
        Name
      >;
    };
    download: {
      consumeDownloadGrantForUrl: FunctionReference<
        "mutation",
        "internal",
        {
          accessKey?: string;
          downloadToken: string;
          password?: string;
          r2Config?: {
            accessKeyId: string;
            accountId: string;
            bucketName: string;
            secretAccessKey: string;
          };
        },
        {
          downloadUrl?: string;
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
        },
        Name
      >;
      createDownloadGrant: FunctionReference<
        "mutation",
        "internal",
        {
          expiresAt?: null | number;
          maxUses?: null | number;
          password?: string;
          storageId: string;
        },
        {
          downloadToken: string;
          expiresAt: null | number;
          maxUses: null | number;
          storageId: string;
        },
        Name
      >;
    };
    queries: {
      getFile: FunctionReference<
        "query",
        "internal",
        { storageId: string },
        {
          _id: string;
          expiresAt: number | null;
          storageId: string;
          storageProvider: "convex" | "r2";
        } | null,
        Name
      >;
      hasAccessKey: FunctionReference<
        "query",
        "internal",
        { accessKey: string; storageId: string },
        boolean,
        Name
      >;
      listAccessKeysPage: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          storageId: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<string>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        },
        Name
      >;
      listDownloadGrantsPage: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _id: string;
            expiresAt: number | null;
            hasPassword: boolean;
            maxUses: null | number;
            storageId: string;
            useCount: number;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        },
        Name
      >;
      listFilesByAccessKeyPage: FunctionReference<
        "query",
        "internal",
        {
          accessKey: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _id: string;
            expiresAt: number | null;
            storageId: string;
            storageProvider: "convex" | "r2";
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        },
        Name
      >;
      listFilesPage: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _id: string;
            expiresAt: number | null;
            storageId: string;
            storageProvider: "convex" | "r2";
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        },
        Name
      >;
    };
    transfer: {
      transferFile: FunctionReference<
        "action",
        "internal",
        {
          r2Config?: {
            accessKeyId: string;
            accountId: string;
            bucketName: string;
            secretAccessKey: string;
          };
          storageId: string;
          targetProvider: "convex" | "r2";
        },
        { storageId: string; storageProvider: "convex" | "r2" },
        Name
      >;
    };
    upload: {
      computeR2Metadata: FunctionReference<
        "action",
        "internal",
        {
          r2Config: {
            accessKeyId: string;
            accountId: string;
            bucketName: string;
            secretAccessKey: string;
          };
          storageId: string;
        },
        {
          contentType: string | null;
          sha256: string;
          size: number;
          storageId: string;
        },
        Name
      >;
      finalizeUpload: FunctionReference<
        "mutation",
        "internal",
        {
          accessKeys: Array<string>;
          expiresAt?: null | number;
          metadata?: {
            contentType: string | null;
            sha256: string;
            size: number;
          };
          storageId: string;
          uploadToken: string;
        },
        {
          expiresAt: null | number;
          metadata: {
            contentType: string | null;
            sha256: string;
            size: number;
            storageId: string;
          } | null;
          storageId: string;
          storageProvider: "convex" | "r2";
        },
        Name
      >;
      generateUploadUrl: FunctionReference<
        "mutation",
        "internal",
        {
          provider: "convex" | "r2";
          r2Config?: {
            accessKeyId: string;
            accountId: string;
            bucketName: string;
            secretAccessKey: string;
          };
        },
        {
          storageId: string | null;
          storageProvider: "convex" | "r2";
          uploadToken: string;
          uploadTokenExpiresAt: number;
          uploadUrl: string;
        },
        Name
      >;
      registerFile: FunctionReference<
        "mutation",
        "internal",
        {
          accessKeys: Array<string>;
          expiresAt?: null | number;
          metadata?: {
            contentType: string | null;
            sha256: string;
            size: number;
          };
          storageId: string;
          storageProvider: "convex" | "r2";
        },
        {
          expiresAt: null | number;
          metadata: {
            contentType: string | null;
            sha256: string;
            size: number;
            storageId: string;
          } | null;
          storageId: string;
          storageProvider: "convex" | "r2";
        },
        Name
      >;
    };
  };
