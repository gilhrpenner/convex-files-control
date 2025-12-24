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
        { limit?: number },
        { deletedCount: number; hasMore: boolean },
        Name
      >;
      deleteFile: FunctionReference<
        "mutation",
        "internal",
        { storageId: string },
        { deleted: boolean },
        Name
      >;
    };
    download: {
      consumeDownloadGrantForUrl: FunctionReference<
        "mutation",
        "internal",
        { accessKey?: string; downloadToken: string },
        {
          downloadUrl?: string;
          status:
            | "ok"
            | "not_found"
            | "expired"
            | "exhausted"
            | "file_missing"
            | "file_expired"
            | "access_denied";
        },
        Name
      >;
      createDownloadGrant: FunctionReference<
        "mutation",
        "internal",
        {
          expiresAt?: null | number;
          maxUses?: null | number;
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
        { _id: string; expiresAt: number | null; storageId: string } | null,
        Name
      >;
      hasAccessKey: FunctionReference<
        "query",
        "internal",
        { accessKey: string; storageId: string },
        boolean,
        Name
      >;
      listAccessKeys: FunctionReference<
        "query",
        "internal",
        { storageId: string },
        Array<string>,
        Name
      >;
      listDownloadGrants: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          _id: string;
          expiresAt: number | null;
          maxUses: null | number;
          storageId: string;
          useCount: number;
        }>,
        Name
      >;
      listFiles: FunctionReference<
        "query",
        "internal",
        {},
        Array<{ _id: string; expiresAt: number | null; storageId: string }>,
        Name
      >;
      listFilesByAccessKey: FunctionReference<
        "query",
        "internal",
        { accessKey: string },
        Array<{ _id: string; expiresAt: number | null; storageId: string }>,
        Name
      >;
    };
    upload: {
      finalizeUpload: FunctionReference<
        "mutation",
        "internal",
        {
          accessKeys: Array<string>;
          expiresAt?: null | number;
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
          };
          storageId: string;
        },
        Name
      >;
      generateUploadUrl: FunctionReference<
        "mutation",
        "internal",
        {},
        {
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
        },
        {
          expiresAt: null | number;
          metadata: {
            contentType: string | null;
            sha256: string;
            size: number;
            storageId: string;
          };
          storageId: string;
        },
        Name
      >;
    };
  };
