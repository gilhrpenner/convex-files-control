import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const downloadGrantFields = schema.tables.downloadGrants.validator.fields;

export const downloadConsumeStatusValidator = v.union(
  v.literal("ok"),
  v.literal("not_found"),
  v.literal("expired"),
  v.literal("exhausted"),
  v.literal("file_missing"),
  v.literal("file_expired"),
  v.literal("access_denied"),
  v.literal("password_required"),
  v.literal("invalid_password"),
);

export const fileMetadataValidator = v.object({
  storageId: v.string(),
  size: v.number(),
  sha256: v.string(),
  contentType: v.union(v.string(), v.null()),
});

export const fileMetadataInputValidator = v.object({
  size: v.number(),
  sha256: v.string(),
  contentType: v.union(v.string(), v.null()),
});

export const fileSummaryValidator = v.object({
  _id: v.id("files"),
  storageId: v.string(),
  expiresAt: v.union(v.number(), v.null()),
});

export const downloadGrantSummaryValidator = v.object({
  _id: v.id("downloadGrants"),
  storageId: v.string(),
  expiresAt: v.union(v.number(), v.null()),
  maxUses: downloadGrantFields.maxUses,
  useCount: downloadGrantFields.useCount,
  hasPassword: v.boolean(),
});

export type FileSummary = {
  _id: Id<"files">;
  storageId: string;
  expiresAt: number | null;
};

export type DownloadGrantSummary = {
  _id: Id<"downloadGrants">;
  storageId: string;
  expiresAt: number | null;
  maxUses: number | null;
  useCount: number;
  hasPassword: boolean;
};

export function toFileSummary(file: Doc<"files">): FileSummary {
  return {
    _id: file._id,
    storageId: file.storageId,
    expiresAt: file.expiresAt ?? null,
  };
}

export function toDownloadGrantSummary(
  grant: Doc<"downloadGrants">,
): DownloadGrantSummary {
  return {
    _id: grant._id,
    storageId: grant.storageId,
    expiresAt: grant.expiresAt ?? null,
    maxUses: grant.maxUses ?? null,
    useCount: grant.useCount,
    hasPassword: Boolean(grant.passwordHash),
  };
}
