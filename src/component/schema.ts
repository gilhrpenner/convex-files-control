import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { storageProviderValidator } from "./storageProvider";

export default defineSchema({
  files: defineTable({
    storageId: v.string(),
    storageProvider: storageProviderValidator,
    expiresAt: v.optional(v.number()),
    virtualPath: v.optional(v.string()),
  })
    .index("by_storageId", ["storageId"])
    .index("by_virtualPath", ["virtualPath"])
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
    shareableLink: v.optional(v.boolean()),
    passwordHash: v.optional(v.string()),
    passwordSalt: v.optional(v.string()),
    passwordIterations: v.optional(v.number()),
    passwordAlgorithm: v.optional(v.string()),
  })
    .index("by_storageId", ["storageId"])
    .index("by_expiresAt", ["expiresAt"]),

  pendingUploads: defineTable({
    expiresAt: v.number(),
    storageProvider: storageProviderValidator,
    storageId: v.optional(v.string()),
    virtualPath: v.optional(v.string()),
  }).index("by_expiresAt", ["expiresAt"]),
});
