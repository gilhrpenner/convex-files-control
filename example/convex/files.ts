import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api.js";
import { mutation } from "./_generated/server.js";
import { getR2ConfigFromEnv } from "./r2Config.js";

export const generateUploadUrl = mutation({
  args: {
    provider: v.union(v.literal("convex"), v.literal("r2")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("User is not authenticated.");
    }

    /**
     * R2 is optional, if you have no plans to use it, you can skip this and
     * remove the `r2Config` argument from the `generateUploadUrl` mutation.
     */
    const r2Config = getR2ConfigFromEnv();
    if (args.provider === "r2" && !r2Config) {
      throw new ConvexError("R2 configuration is missing.");
    }

    return await ctx.runMutation(
      components.convexFilesControl.upload.generateUploadUrl,
      {
        provider: args.provider,
        r2Config: r2Config ?? undefined,
      },
    );
  },
});

export const finalizeUpload = mutation({
  args: {
    uploadToken: v.string(),
    storageId: v.string(),
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
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("User is not authenticated.");
    }

    return await ctx.runMutation(
      components.convexFilesControl.upload.finalizeUpload,
      {
        /**
         * If you want to allow multiple users to access the file or even allow
         * to all users of a given tenant, you can pass the them here.
         */
        accessKeys: [userId],
        ...args,
      },
    );
  },
});
