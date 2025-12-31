import { getAuthUserId } from "@convex-dev/auth/server";
import { registerRoutes } from "@gilhrpenner/convex-files-control";
import { httpRouter } from "convex/server";
import { api, components } from "./_generated/api";
import { auth } from "./auth";
import { getR2ConfigFromEnv } from "./r2Config";

const http = httpRouter();

auth.addHttpRoutes(http);

/**
 * File Upload Routes with @gilhrpenner/convex-files-control
 *
 * There are two approaches to handle file uploads:
 *
 * ## Option 1: Use `registerRoutes` (shown below)
 *
 * Mount the component's HTTP routes with a `checkUploadRequest` hook for authentication.
 * This is a quick setup that provides `/files/upload` and `/files/download` endpoints.
 *
 * - `pathPrefix`: The URL path prefix for routes (e.g., "files" → `/files/upload`, `/files/download`)
 * - `checkUploadRequest`: Required hook that authenticates the request and returns `{ accessKeys }`.
 *   Return a Response to reject the request (e.g., 401 Unauthorized).
 * - `enableUploadRoute`: Set to true to enable the upload route.
 * - `enableDownloadRoute`: Defaults to true. Use `checkDownloadRequest` for custom download logic.
 *
 * ## Option 2: Implement custom HTTP actions (see commented example below)
 *
 * For more control, skip `registerRoutes` and implement your own HTTP actions using
 * the component's mutations directly via `components.convexFilesControl.upload.*`.
 *
 * This approach is useful when:
 * - You need custom request parsing or validation
 * - You want to integrate with other authentication systems
 * - You need to add file to your own tables after upload
 *
 * Example custom implementation:
 * ```ts
 * http.route({
 *   path: "/custom-upload",
 *   method: "POST",
 *   handler: httpAction(async (ctx, request) => {
 *     const userId = await getAuthUserId(ctx);
 *     if (!userId) return new Response("Unauthorized", { status: 401 });
 *
 *     // Parse your request (multipart, JSON, etc.)
 *     const formData = await request.formData();
 *     const file = formData.get("file") as Blob;
 *
 *     // Generate upload URL from component
 *     const { uploadUrl, uploadToken } = await ctx.runMutation(
 *       components.convexFilesControl.upload.generateUploadUrl,
 *       { provider: "convex", virtualPath: "/tenant/123/report.pdf" }
 *     );
 *
 *     // Upload file to storage
 *     const uploadRes = await fetch(uploadUrl, { method: "POST", body: file });
 *     const { storageId } = await uploadRes.json();
 *
 *     // Finalize with your accessKeys
 *     const result = await ctx.runMutation(
 *       components.convexFilesControl.upload.finalizeUpload,
 *       { uploadToken, storageId, accessKeys: [userId], virtualPath: "/tenant/123/report.pdf" }
 *     );
 *
 *     return new Response(JSON.stringify(result), { status: 200 });
 *   }),
 * });
 * ```
 */
/** Demo limits - in production you have full control over these */
const DEMO_MAX_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours

registerRoutes(http, components.convexFilesControl, {
  // Path prefix for routes: creates /files/upload and /files/download
  pathPrefix: "files",

  // Enable the upload route (disabled by default for security)
  enableUploadRoute: true,

  // R2 config is optional, only needed if using R2 storage provider
  r2: getR2ConfigFromEnv() ?? undefined,

  // Required hook for upload authentication
  // Called before every upload to authenticate and provide accessKeys
  checkUploadRequest: async (ctx, _args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    return { accessKeys: [userId] };
  },
  onUploadComplete: async (ctx, args) => {
    // Prefer an explicit form field if the client supplied one
    const fileNameFromForm = args.formData.get("fileName");
    const fileName =
      typeof fileNameFromForm === "string"
        ? fileNameFromForm
        : (args.file as File).name ?? "untitled";

    // Demo limit: Enforce 24hr max expiration
    const now = Date.now();
    const maxExpiry = now + DEMO_MAX_EXPIRATION_MS;
    let expiresAt = args.result.expiresAt;
    if (expiresAt == null || expiresAt > maxExpiry) {
      expiresAt = maxExpiry;
    }

    const virtualPathFromForm = args.formData.get("virtualPath");
    const virtualPath =
      typeof virtualPathFromForm === "string" && virtualPathFromForm.trim()
        ? virtualPathFromForm.trim()
        : args.result.virtualPath ?? undefined;

    await ctx.runMutation(api.files.recordUpload, {
      storageId: args.result.storageId,
      storageProvider: args.result.storageProvider,
      fileName,
      virtualPath,
      expiresAt,
      metadata: args.result.metadata,
    });
  },
  /**
   * Hook for download authentication.
   * For non-public shareable links, we need to pass the user's ID as accessKey.
   * For public links (shareableLink: true), accessKey is not required.
   */
  checkDownloadRequest: async (ctx) => {
    // Try to get the authenticated user's ID
    const userId = await getAuthUserId(ctx);

    // If authenticated, return the userId as accessKey
    // The component will use this for non-public links
    if (userId) {
      return { accessKey: userId };
    }
    // Return nothing - let the request proceed
    // Public shareable links don't need an accessKey
  },
});

export default http;
