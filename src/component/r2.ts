import { ConvexError, v } from "convex/values";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { R2Config } from "../shared/types";
import { r2EndpointFromAccountId } from "../shared/r2";

export const r2ConfigValidator = v.object({
  accountId: v.string(),
  accessKeyId: v.string(),
  secretAccessKey: v.string(),
  bucketName: v.string(),
});

export function requireR2Config(
  config: R2Config | undefined | null,
  context?: string,
): R2Config {
  if (config) {
    return config;
  }
  const suffix = context ? ` for ${context}` : "";
  throw new ConvexError(`R2 configuration is required${suffix}.`);
}

export function createR2Client(config: R2Config) {
  return new S3Client({
    region: "auto",
    endpoint: r2EndpointFromAccountId(config.accountId),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function getR2UploadUrl(config: R2Config, key: string) {
  const r2 = createR2Client(config);
  return await getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: config.bucketName, Key: key }),
  );
}

export async function getR2DownloadUrl(config: R2Config, key: string) {
  const r2 = createR2Client(config);
  return await getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: config.bucketName, Key: key }),
  );
}

export async function deleteR2Object(config: R2Config, key: string) {
  const r2 = createR2Client(config);
  await r2.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }));
}
