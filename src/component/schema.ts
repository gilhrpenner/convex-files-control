import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  files: defineTable({
    storageId: v.string(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_storageId", ["storageId"])
    .index("by_expiresAt", ["expiresAt"]),

  fileAccess: defineTable({
    fileId: v.id("files"),
    storageId: v.string(),
    accessKey: v.string(),
  })
    .index("by_fileId", ["fileId"])
    .index("by_storageId", ["storageId"])
    .index("by_accessKey_and_storageId", ["accessKey", "storageId"]),

  downloadGrants: defineTable({
    storageId: v.string(),
    expiresAt: v.optional(v.number()),
    maxUses: v.union(v.null(), v.number()),
    useCount: v.number(),
  })
    .index("by_storageId", ["storageId"])
    .index("by_expiresAt", ["expiresAt"]),

  pendingUploads: defineTable({
    expiresAt: v.number(),
  }).index("by_expiresAt", ["expiresAt"]),
});
