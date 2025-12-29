# Convex Files Control

A Convex component for secure file uploads, access control, download grants, and
lifecycle cleanup. Works with Convex storage and Cloudflare R2, and ships with
an optional HTTP upload/download router plus a React upload hook.

**[Live Demo →](https://convex-files-control-example.pages.dev)**

## Features

- Two-step uploads (presigned URL) with access keys and optional expiration.
- Optional HTTP upload/download routes with auth hooks.
- Download grants with max uses, expiration, optional password, and shareable
  links.
- Access-key based authorization (user IDs, tenant IDs, etc.).
- Built-in cleanup for expired uploads, grants, and files.
- Transfer files between Convex and R2.
- React hook for presigned or HTTP uploads.

## Install

```bash
npm install @gilhrpenner/convex-files-control
```

## Quick start

### 1) Add the component

```ts
// convex.config.ts
import { defineApp } from "convex/server";
import convexFilesControl from "@gilhrpenner/convex-files-control/convex.config";

const app = defineApp();
app.use(convexFilesControl);

export default app;
```

### 2) Create wrapper functions in your app

The component stores access control and download grants. Your app should store
its own file metadata (name, owner, etc.) and enforce auth. The wrappers below
mirror the example app in `example/convex/files.ts`.

```ts
// convex/files.ts
import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { components } from "./_generated/api";

export const generateUploadUrl = mutation({
  args: {
    provider: v.union(v.literal("convex"), v.literal("r2")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Unauthorized");

    return await ctx.runMutation(
      components.convexFilesControl.upload.generateUploadUrl,
      {
        provider: args.provider,
        // r2Config: { accountId, accessKeyId, secretAccessKey, bucketName },
      },
    );
  },
});

export const finalizeUpload = mutation({
  args: {
    uploadToken: v.string(),
    storageId: v.string(),
    fileName: v.string(),
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Unauthorized");

    const { fileName, ...componentArgs } = args;
    const result = await ctx.runMutation(
      components.convexFilesControl.upload.finalizeUpload,
      {
        ...componentArgs,
        accessKeys: [identity.subject],
      },
    );

    // Store your own file record (name, owner, etc.) here.
    // await ctx.db.insert("files", { ... });

    return result;
  },
});
```

### 3) Optional HTTP routes

If you want `/files/upload` and `/files/download`, register the router in
`convex/http.ts`. Access keys are provided by your hook (not via the form).

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { registerRoutes } from "@gilhrpenner/convex-files-control";
import { components } from "./_generated/api";

const http = httpRouter();

registerRoutes(http, components.convexFilesControl, {
  pathPrefix: "files",
  enableUploadRoute: true,

  // Required when enableUploadRoute is true
  checkUploadRequest: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    return { accessKeys: [identity.subject] };
  },

  // Optional: persist file metadata after a successful HTTP upload
  onUploadComplete: async (ctx, { result, file }) => {
    const fileName = (file as File).name ?? "untitled";
    // await ctx.runMutation(api.files.recordUpload, { ...result, fileName });
  },

  // Optional: provide accessKey for downloads
  checkDownloadRequest: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity) return { accessKey: identity.subject };
  },
});

export default http;
```

HTTP upload requires `multipart/form-data` with fields:

- `file` (required)
- `provider` (optional, "convex" | "r2")
- `expiresAt` (optional, timestamp or `null`)

Access keys are not accepted via the form; they must come from
`checkUploadRequest`.

Useful route options:

- `pathPrefix` (default: `/files`)
- `defaultUploadProvider` (`\"convex\"` or `\"r2\"`)
- `enableDownloadRoute` (default: `true`)
- `requireAccessKey` (force `checkDownloadRequest` to return an access key)
- `passwordHeader` / `passwordQueryParam` (override or disable password inputs)

## Uploading files

### Presigned URL flow

```ts
// Client-side
const { uploadUrl, uploadToken } = await generateUploadUrl({
  provider: "convex",
});

const uploadResponse = await fetch(uploadUrl, {
  method: "POST",
  body: file,
  headers: { "Content-Type": file.type || "application/octet-stream" },
});

const { storageId } = await uploadResponse.json();

const result = await finalizeUpload({
  uploadToken,
  storageId,
  fileName: file.name,
  expiresAt: Date.now() + 60 * 60 * 1000,
});
```

### React hook

```tsx
import { useUploadFile } from "@gilhrpenner/convex-files-control/react";
import { api } from "../convex/_generated/api";

const convexSiteUrl = import.meta.env.VITE_CONVEX_URL.replace(
  ".cloud",
  ".site",
);

const { uploadFile } = useUploadFile(api.files, {
  method: "presigned",
  http: { baseUrl: convexSiteUrl },
});

// Presigned
await uploadFile({ file, provider: "convex" });

// HTTP route
await uploadFile({
  file,
  method: "http",
  provider: "convex",
  http: {
    baseUrl: convexSiteUrl,
    // authToken: useAuthToken() from @convex-dev/auth/react
  },
});
```

`uploadFile` accepts:

- `file` (required)
- `provider` ("convex" | "r2")
- `expiresAt` (timestamp or `null`)
- `method` ("presigned" | "http")

## Downloading files

### Create a grant + build a URL

```ts
import { buildDownloadUrl } from "@gilhrpenner/convex-files-control";

const grant = await ctx.runMutation(
  components.convexFilesControl.download.createDownloadGrant,
  {
    storageId,
    maxUses: 1,
    expiresAt: Date.now() + 10 * 60 * 1000,
    shareableLink: false,
  },
);

const url = buildDownloadUrl({
  baseUrl: "https://<your-convex-site>",
  downloadToken: grant.downloadToken,
  filename: "report.pdf",
  // pathPrefix: "/files", // Optional if you changed the HTTP route prefix
});
```

Access keys are not placed in the URL. For private grants, supply them via
`checkDownloadRequest` (HTTP route) or pass `accessKey` when calling
`consumeDownloadGrantForUrl`.

### Shareable links

Set `shareableLink: true` to allow unauthenticated downloads (no access key
required). This is how the example app generates public links. If you enable
`requireAccessKey` on the HTTP route, shareable links will still require
`checkDownloadRequest` to return an access key.

### Password-protected grants

```ts
const grant = await ctx.runMutation(
  components.convexFilesControl.download.createDownloadGrant,
  { storageId, password: "secret-passphrase" },
);
```

To consume a password-protected grant, pass `password` to
`consumeDownloadGrantForUrl`, or send it to the HTTP route via the
`x-download-password` header (preferred) or the `password` query param. Query
params can leak into logs, so headers or POST flows are safer.

## Access control & queries

Access keys are normalized (trimmed) and must contain at least one non-empty
value.

- `accessControl.addAccessKey(storageId, accessKey)`
- `accessControl.removeAccessKey(storageId, accessKey)`
- `accessControl.updateFileExpiration(storageId, expiresAt)`
- `queries.hasAccessKey(storageId, accessKey)`
- `queries.listAccessKeysPage(storageId, paginationOpts)`
- `queries.listFilesPage(paginationOpts)`
- `queries.listFilesByAccessKeyPage(accessKey, paginationOpts)`
- `queries.listDownloadGrantsPage(paginationOpts)`
- `queries.getFile({ storageId })`

Pagination uses `{ numItems: number, cursor: string | null }`.

## Cleanup

Use `cleanUp.cleanupExpired` to delete expired uploads, grants, and files. The
example app wraps this in a mutation and runs it in a cron job.

```ts
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.hourly(
  "cleanup-expired-files",
  { minuteUTC: 0 },
  internal.files.cleanupExpiredFiles,
  {},
);
export default crons;
```

## Server-side helper (FilesControl)

If you prefer a class wrapper around component calls, use `FilesControl`:

```ts
import { FilesControl } from "@gilhrpenner/convex-files-control";
import { components } from "./_generated/api";

const files = new FilesControl(components.convexFilesControl, {
  // r2: { accountId, accessKeyId, secretAccessKey, bucketName },
});

await files.generateUploadUrl(ctx, { provider: "convex" });
```

`FilesControl.clientApi()` also returns a ready-to-export API surface with
optional hooks if you want the component to generate your Convex mutations and
queries for you.

## R2 configuration

Provide R2 credentials when you use R2 for uploads, downloads, deletes, or
transfers. You can pass `r2Config` to the component calls or supply env vars for
the HTTP routes:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`

## Transfer between providers

```ts
const result = await ctx.runAction(
  components.convexFilesControl.transfer.transferFile,
  { storageId, targetProvider: "r2", r2Config },
);
```

The transfer preserves access keys and download grants, updates the file record,
and deletes the original storage object.

## Testing helper

```ts
import { convexTest } from "convex-test";
import { register } from "@gilhrpenner/convex-files-control/test";

const t = convexTest(schema, modules);
register(t, "convexFilesControl");
```

## Example app

**[Live Demo →](https://convex-files-control-example.pages.dev)**

A full Convex + React + Convex Auth implementation lives in `example/`. It
demonstrates:

- presigned and HTTP uploads
- authenticated downloads and shareable links
- access key management
- transfer between Convex and R2
- scheduled cleanup
