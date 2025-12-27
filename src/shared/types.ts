export type UploadMetadata = {
  storageId: string;
  size: number;
  sha256: string;
  contentType: string | null;
};

export type UploadResult = {
  storageId: string;
  expiresAt: number | null;
  metadata: UploadMetadata;
};
