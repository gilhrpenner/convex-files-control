import { afterEach, describe, expect, test, vi } from "vitest";
import {
  findFileByStorageId,
  findFileByVirtualPath,
  hasAccessKey,
  hashPassword,
  normalizeAccessKey,
  normalizeAccessKeys,
  normalizeVirtualPath,
  toStorageId,
  verifyPassword,
} from "../component/lib.js";
import { Buffer } from "node:buffer";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lib helpers", () => {
  test("normalizeAccessKey trims and rejects empty values", () => {
    expect(normalizeAccessKey(undefined)).toBeNull();
    expect(normalizeAccessKey("   ")).toBeNull();
    expect(normalizeAccessKey(" key ")).toBe("key");
  });

  test("normalizeAccessKeys dedupes and filters", () => {
    expect(normalizeAccessKeys(["a", " a ", "", "b", "b "])).toEqual([
      "a",
      "b",
    ]);
  });

  test("normalizeVirtualPath trims and rejects empty values", () => {
    expect(normalizeVirtualPath(undefined)).toBeNull();
    expect(normalizeVirtualPath("   ")).toBeNull();
    expect(normalizeVirtualPath(" /path ")).toBe("/path");
  });

  test("toStorageId preserves ids", () => {
    expect(toStorageId("storage" as string)).toBe("storage");
  });

  test("findFileByStorageId and hasAccessKey queries", async () => {
    const file = { _id: "file", storageId: "storage" };
    const ctx = {
      db: {
        query: (table: string) => ({
          withIndex: () => ({
            first: async () => (table === "files" ? file : null),
          }),
        }),
      },
    } as any;

    const found = await findFileByStorageId(ctx, "storage");
    expect(found).toBe(file);

    const foundVirtual = await findFileByVirtualPath(ctx, "/virtual");
    expect(foundVirtual).toBe(file);

    const ctxAccess = {
      db: {
        query: (table: string) => ({
          withIndex: () => ({
            first: async () =>
              table === "fileAccess" ? { _id: "access" } : null,
          }),
        }),
      },
    } as any;

    const ok = await hasAccessKey(ctxAccess, {
      storageId: "storage",
      accessKey: "key",
    });
    expect(ok).toBe(true);

    const ctxMissing = {
      db: {
        query: () => ({
          withIndex: () => ({
            first: async () => null,
          }),
        }),
      },
    } as any;

    const missing = await hasAccessKey(ctxMissing, {
      storageId: "storage",
      accessKey: "missing",
    });
    expect(missing).toBe(false);

    const blank = await hasAccessKey(ctxMissing, {
      storageId: "storage",
      accessKey: " ",
    });
    expect(blank).toBe(false);
  });
});

describe("password hashing", () => {
  test("hashes and verifies with web base64 helpers", async () => {
    const salt = new Uint8Array([1, 2, 3, 4]);
    const record = await hashPassword("secret", { iterations: 2, salt });

    expect(record.algorithm).toBe("pbkdf2-sha256");
    expect(record.hash).toBeTypeOf("string");
    expect(record.salt).toBeTypeOf("string");

    const ok = await verifyPassword("secret", record);
    expect(ok).toBe(true);

    const bad = await verifyPassword("wrong", record);
    expect(bad).toBe(false);
  });

  test("verifyPassword rejects invalid inputs", async () => {
    expect(
      await verifyPassword("secret", {
        hash: "",
        salt: "",
        iterations: 0,
      }),
    ).toBe(false);

    expect(
      await verifyPassword("secret", {
        hash: "a",
        salt: "b",
        iterations: 1,
        algorithm: "md5",
      }),
    ).toBe(false);

    expect(
      await verifyPassword("secret", {
        hash: "not@@@",
        salt: "bad@@@",
        iterations: 1,
        algorithm: "pbkdf2-sha256",
      }),
    ).toBe(false);
  });

  test("verifyPassword returns false on length mismatch", async () => {
    const shortHash = Buffer.from("short").toString("base64");
    const shortSalt = Buffer.from("salt").toString("base64");
    const result = await verifyPassword("secret", {
      hash: shortHash,
      salt: shortSalt,
      iterations: 1,
      algorithm: "pbkdf2-sha256",
    });
    expect(result).toBe(false);
  });

  test("hash and verify fall back to Buffer base64", async () => {
    vi.stubGlobal("btoa", undefined as any);
    vi.stubGlobal("atob", undefined as any);
    vi.stubGlobal("Buffer", Buffer as any);

    const salt = new Uint8Array([9, 9, 9, 9]);
    const record = await hashPassword("secret", { iterations: 1, salt });
    const ok = await verifyPassword("secret", record);

    expect(ok).toBe(true);
  });
});
