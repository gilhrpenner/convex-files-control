import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  files: defineTable({
    storageId: v.id("_storage"),
    expiresAt: v.optional(v.number()),
  })
    .index("by_storageId", ["storageId"])
    .index("by_expiresAt", ["expiresAt"]),

  fileAccess: defineTable({
    storageId: v.id("_storage"),
    accessKey: v.string(),
  })
    .index("by_storageId", ["storageId"])
    .index("by_accessKey", ["accessKey"])
    .index("by_accessKey_and_storageId", ["accessKey", "storageId"]),

  downloadGrants: defineTable({
    storageId: v.id("_storage"),
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
