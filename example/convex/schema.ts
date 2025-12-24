import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  customFiles: defineTable({
    storageId: v.id("_storage"),
    fileName: v.string(),
    expiresAt: v.union(v.null(), v.number()),
    size: v.number(),
    sha256: v.string(),
    contentType: v.union(v.string(), v.null()),
    accessKey: v.string(),
  }).index("by_storageId", ["storageId"]),
});
