export type StorageProvider = "convex" | "r2";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

export type UploadMetadata = {
  storageId: string;
  size: number;
  sha256: string;
  contentType: string | null;
};

export type UploadResult = {
  storageId: string;
  storageProvider: StorageProvider;
  expiresAt: number | null;
  metadata: UploadMetadata | null;
  virtualPath?: string | null;
};

export function isStorageProvider(
  value: unknown,
): value is StorageProvider {
  return value === "convex" || value === "r2";
}
