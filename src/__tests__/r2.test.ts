import { describe, expect, test, vi } from "vitest";
import { r2EndpointFromAccountId } from "../shared/r2.js";

const mocks = vi.hoisted(() => {
  return {
    send: vi.fn(async () => ({})),
    getSignedUrl: vi.fn(async (_client: any, command: any) => {
      return `signed:${command.input.Bucket}:${command.input.Key}`;
    }),
    clients: [] as any[],
  };
});

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    config: any;
    send = mocks.send;
    constructor(config: any) {
      this.config = config;
      mocks.clients.push(this);
    }
  }
  class PutObjectCommand {
    input: any;
    constructor(input: any) {
      this.input = input;
    }
  }
  class GetObjectCommand {
    input: any;
    constructor(input: any) {
      this.input = input;
    }
  }
  class DeleteObjectCommand {
    input: any;
    constructor(input: any) {
      this.input = input;
    }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand };
});

vi.mock("@aws-sdk/s3-request-presigner", () => {
  return {
    getSignedUrl: mocks.getSignedUrl,
  };
});

import {
  createR2Client,
  deleteR2Object,
  getR2DownloadUrl,
  getR2UploadUrl,
  requireR2Config,
} from "../component/r2.js";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

describe("shared r2 endpoint", () => {
  test("r2EndpointFromAccountId builds endpoint", () => {
    expect(r2EndpointFromAccountId("acct")).toBe(
      "https://acct.r2.cloudflarestorage.com",
    );
  });
});

describe("component r2 helpers", () => {
  const config = {
    accountId: "acct",
    accessKeyId: "access",
    secretAccessKey: "secret",
    bucketName: "bucket",
  };

  test("requireR2Config returns config or throws", () => {
    expect(requireR2Config(config)).toBe(config);
    expect(() => requireR2Config(null)).toThrow(
      "R2 configuration is required.",
    );
    expect(() => requireR2Config(undefined, "testing")).toThrow(
      "R2 configuration is required for testing.",
    );
  });

  test("createR2Client configures endpoint and credentials", () => {
    const client = createR2Client(config) as unknown as S3Client;
    expect(client).toBeInstanceOf(S3Client);
    expect((client as any).config.endpoint).toBe(
      "https://acct.r2.cloudflarestorage.com",
    );
    expect((client as any).config.credentials).toEqual({
      accessKeyId: "access",
      secretAccessKey: "secret",
    });
  });

  test("getR2UploadUrl and getR2DownloadUrl use signed urls", async () => {
    const uploadUrl = await getR2UploadUrl(config, "key1");
    const downloadUrl = await getR2DownloadUrl(config, "key2");

    expect(uploadUrl).toBe("signed:bucket:key1");
    expect(downloadUrl).toBe("signed:bucket:key2");

    const uploadCall = mocks.getSignedUrl.mock.calls[0];
    expect(uploadCall?.[1]).toBeInstanceOf(PutObjectCommand);

    const downloadCall = mocks.getSignedUrl.mock.calls[1];
    expect(downloadCall?.[1]).toBeInstanceOf(GetObjectCommand);
  });

  test("deleteR2Object sends delete command", async () => {
    await deleteR2Object(config, "delete-key");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectCommand);
    expect(mocks.send.mock.calls[0]?.[0].input).toEqual({
      Bucket: "bucket",
      Key: "delete-key",
    });
  });
});
