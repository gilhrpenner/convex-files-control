import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
export default defineSchema({
  ...authTables,

  filesUploads: defineTable({
    storageId: v.string(),
    storageProvider: v.union(v.literal("convex"), v.literal("r2")),
    userId: v.id("users"),
    fileName: v.string(),
    expiresAt: v.union(v.null(), v.number()),
    metadata: v.union(
      v.object({
        storageId: v.string(),
        size: v.number(),
        sha256: v.string(),
        contentType: v.union(v.string(), v.null()),
      }),
      v.null(),
    ),
  })
    .index("by_storageId", ["storageId"])
    .index("by_userId", ["userId"])
    .index("by_expiresAt", ["expiresAt"]),
});
