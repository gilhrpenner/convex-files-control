# Convex Files Control

A robust, secure file management component for Convex, featuring access control,
temporary download links, and automatic cleanup.

## Features

- **Secure Uploads**: Support for both presigned URLs (client-side) and HTTP
  actions (server-side).
- **Access Control**: Granular file access using "Access Keys" (e.g., User IDs,
  Tenant IDs).
- **Secure Downloads**: Generate temporary, single-use, or limited-use download
  links.
- **Expiration & Cleanup**: Built-in support for file expiration and automatic
  background cleanup.
- **Metadata**: Computes and returns SHA-256 checksums, size, and MIME type.

## Installation

```bash
npm install @gilhrpenner/convex-files-control
```

## Setup

### 1. Configure Component

Add the component to your `convex.config.ts`:

```typescript
// convex.config.ts
import { defineApp } from "convex/server";
import filesControl from "@gilhrpenner/convex-files-control/convex.config";

const app = defineApp();
app.use(filesControl);

export default app;
```

### 2. Expose the API

Create a file (e.g., `convex/files.ts`) to expose the component's functionality
to your client and define your authentication logic.

```typescript
// convex/files.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { exposeApi } from "@gilhrpenner/convex-files-control";

// Define your authentication/authorization logic
const filesApi = exposeApi(components.convexFilesControl, {
  auth: async (ctx, operation) => {
    // Example: Check if user is authenticated
    // const identity = await ctx.auth.getUserIdentity();
    // if (!identity) throw new Error("Unauthorized");
    // You can inspect 'operation.type' for fine-grained control
    // if (operation.type === "deleteFile" && !isAdmin(identity)) ...
  },
});

// Expose mutations and queries
export const generateUploadUrl = filesApi.generateUploadUrl;
export const finalizeUpload = filesApi.finalizeUpload;
export const registerFile = filesApi.registerFile;
export const createDownloadGrant = filesApi.createDownloadGrant;
export const consumeDownloadGrantForUrl = filesApi.consumeDownloadGrantForUrl;
export const cleanupExpired = filesApi.cleanupExpired;
export const deleteFile = filesApi.deleteFile;
export const addAccessKey = filesApi.addAccessKey;
export const removeAccessKey = filesApi.removeAccessKey;
export const updateFileExpiration = filesApi.updateFileExpiration;
export const listFiles = filesApi.listFiles;
export const listFilesByAccessKey = filesApi.listFilesByAccessKey;
export const getFile = filesApi.getFile;
// ... expose others as needed
```

### 3. Setup HTTP Routes (Optional)

If you want to support direct HTTP uploads or downloads (proxied through
Convex), register the routes in `convex/http.ts`.

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { registerRoutes } from "@gilhrpenner/convex-files-control";
import { components } from "./_generated/api";

const http = httpRouter();

registerRoutes(http, components.convexFilesControl, {
  pathPrefix: "/files", // Routes will be /files/upload and /files/download
  requireAccessKey: false, // Set to true to enforce accessKey param on downloads
});

export default http;
```

## Usage

### Uploading Files

#### Option A: Presigned URL (Recommended)

This is the most efficient method, uploading directly from the client to Convex
storage.

1.  **Generate Upload URL**: Call your exposed `generateUploadUrl` mutation.
2.  **Upload File**: POST the file to the returned `uploadUrl`.
3.  **Finalize**: Call `finalizeUpload` with the `uploadToken` and `storageId`.

```typescript
// Client-side example
const { uploadUrl, uploadToken } = await generateUploadUrl();

const result = await fetch(uploadUrl, {
  method: "POST",
  body: fileBlob, // your file object
  headers: { "Content-Type": fileBlob.type },
});
const { storageId } = await result.json();

const fileParams = {
  uploadToken,
  storageId,
  accessKeys: ["user_123"], // Who can access this file?
  expiresAt: Date.now() + 24 * 60 * 60 * 1000, // Optional expiration
};

const metadata = await finalizeUpload(fileParams);
console.log("File uploaded:", metadata);
```

#### Option B: HTTP Action

Upload directly via your configured HTTP endpoint.

```typescript
const formData = new FormData();
formData.append("file", fileBlob);
formData.append("accessKeys", JSON.stringify(["user_123"]));
// Optional: formData.append("expiresAt", timestamp);

await fetch("https://<your-convex-site>/files/upload", {
  method: "POST",
  body: formData,
});
```

### React Hook (Optional)

If you're using React, the component exports a `useUploadFile` hook that supports
both upload methods with a single API. The HTTP method requires `registerRoutes`
to be set up in `convex/http.ts`.

```tsx
import { useUploadFile } from "@gilhrpenner/convex-files-control/react";
import { api } from "../convex/_generated/api";

const convexSiteUrl = import.meta.env.VITE_CONVEX_URL.replace(".cloud", ".site");

const { uploadFile } = useUploadFile(api.files, {
  http: { baseUrl: convexSiteUrl },
});

// Presigned URL upload
await uploadFile({
  file,
  accessKeys: ["user_123"],
  expiresAt: Date.now() + 60 * 60 * 1000,
  method: "presigned",
});

// HTTP action upload
await uploadFile({
  file,
  accessKeys: ["user_123"],
  method: "http",
});
```

The hook returns the same metadata you get from `finalizeUpload`/HTTP upload, so
you can persist it in your own tables if needed.

### Downloading Files

To download a file securely, you create a "Download Grant". This generates a
token that can be exchanged for the file content.

1.  **Create Grant**: Call `createDownloadGrant` with the `storageId`.
2.  **Build URL**: Use the helper to construct the download link.

```typescript
import { buildDownloadUrl } from "@gilhrpenner/convex-files-control";

// Server-side (Mutation)
export const generateLink = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    // 1. Create a grant (e.g., valid for 1 use)
    const grant = await ctx.runMutation(api.files.createDownloadGrant, {
      storageId: args.storageId,
      maxUses: 1, // Optional: limit uses
      expiresAt: Date.now() + 60 * 1000, // Optional: limit time
    });

    // 2. Build the URL
    // You'll need your Convex HTTP site URL e.g. from process.env.CONVEX_SITE_URL
    return buildDownloadUrl({
      baseUrl: "https://<your-convex-site>",
      downloadToken: grant.downloadToken,
      filename: "report.pdf", // Optional: force filename
      // accessKey: "user_123" // Optional: if you want to embed the key (less secure)
    });
  },
});
```

The user then visits this URL. The component validates the grant and redirects
to the secure storage URL.

### Managing Files

#### Access Control

Files are protected by "Access Keys". A user can only access a file if they have
a matching key (e.g., their User ID).

- `addAccessKey(storageId, accessKey)`
- `removeAccessKey(storageId, accessKey)`
- `hasAccessKey(storageId, accessKey)`

#### File Listings

- `listFiles()`: List all files.
- `listFilesByAccessKey(accessKey)`: List files for a specific user.

#### Cleanup

The component includes a `cleanupExpired` mutation. It is recommended to
schedule this to run periodically (e.g., via Convex Crons) to remove expired
files and unused grants.

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// Run cleanup every hour
crons.hourly("cleanup-files", { minutes: 0 }, api.files.cleanupExpired, {
  limit: 100,
});

export default crons;
```
