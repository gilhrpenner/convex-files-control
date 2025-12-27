import { v } from "convex/values";

export const storageProviderValidator = v.union(
  v.literal("convex"),
  v.literal("r2"),
);

export type StorageProvider = "convex" | "r2";
