/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as r2Config from "../r2Config.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  files: typeof files;
  http: typeof http;
  r2Config: typeof r2Config;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  convexFilesControl: {
    accessControl: {
      addAccessKey: FunctionReference<
        "mutation",
        "internal",
        { accessKey: string; storageId: string },
        { accessKey: string }
      >;
      removeAccessKey: FunctionReference<
        "mutation",
        "internal",
        { accessKey: string; storageId: string },
        { removed: boolean }
      >;
      updateFileExpiration: FunctionReference<
        "mutation",
        "internal",
        { expiresAt: null | number; storageId: string },
        { expiresAt: null | number }
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
        { deletedCount: number; hasMore: boolean }
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
        { deleted: boolean }
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
        null
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
        }
      >;
      createDownloadGrant: FunctionReference<
        "mutation",
        "internal",
        {
          expiresAt?: null | number;
          maxUses?: null | number;
          password?: string;
          shareableLink?: boolean;
          storageId: string;
        },
        {
          downloadToken: string;
          expiresAt: null | number;
          maxUses: null | number;
          shareableLink: boolean;
          storageId: string;
        }
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
        } | null
      >;
      hasAccessKey: FunctionReference<
        "query",
        "internal",
        { accessKey: string; storageId: string },
        boolean
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
        }
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
        }
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
        }
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
        }
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
        { storageId: string; storageProvider: "convex" | "r2" }
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
        }
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
        }
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
        }
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
        }
      >;
    };
  };
};
