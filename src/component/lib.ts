import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type ReadCtx = MutationCtx | QueryCtx;

const PASSWORD_KDF = "pbkdf2-sha256";
const PASSWORD_HASH_ALGORITHM = "SHA-256";
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BYTES = 32;
const DEFAULT_PASSWORD_ITERATIONS = 120_000;

export function normalizeAccessKey(accessKey?: string | null) {
  if (typeof accessKey !== "string") {
    return null;
  }

  const trimmed = accessKey.trim();
  return trimmed === "" ? null : trimmed;
}

export function normalizeAccessKeys(accessKeys: string[]) {
  const normalized = accessKeys
    .map((key) => normalizeAccessKey(key))
    .filter((key): key is string => key != null);
  return [...new Set(normalized)];
}

export function toStorageId(storageId: string) {
  return storageId as Id<"_storage">;
}

export async function findFileByStorageId(ctx: ReadCtx, storageId: string) {
  return ctx.db
    .query("files")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
}

export async function hasAccessKey(
  ctx: ReadCtx,
  args: { accessKey: string; storageId: string },
) {
  const accessKey = normalizeAccessKey(args.accessKey);
  if (!accessKey) {
    return false;
  }

  const access = await ctx.db
    .query("fileAccess")
    .withIndex("by_accessKey_and_storageId", (q) =>
      q.eq("accessKey", accessKey).eq("storageId", args.storageId),
    )
    .first();

  return access != null;
}

export type PasswordHashRecord = {
  hash: string;
  salt: string;
  iterations: number;
  algorithm: typeof PASSWORD_KDF;
};

export async function hashPassword(
  password: string,
  options: { iterations?: number; salt?: Uint8Array } = {},
): Promise<PasswordHashRecord> {
  const iterations = options.iterations ?? DEFAULT_PASSWORD_ITERATIONS;
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const derived = await derivePasswordBits(password, salt, iterations);
  return {
    hash: bytesToBase64(derived),
    salt: bytesToBase64(salt),
    iterations,
    algorithm: PASSWORD_KDF,
  };
}

export async function verifyPassword(
  password: string,
  record: {
    hash: string;
    salt: string;
    iterations: number;
    algorithm?: string | null;
  },
): Promise<boolean> {
  if (!record.hash || !record.salt || !record.iterations) {
    return false;
  }
  if (record.algorithm && record.algorithm !== PASSWORD_KDF) {
    return false;
  }

  try {
    const salt = base64ToBytes(record.salt);
    const expected = base64ToBytes(record.hash);
    const derived = await derivePasswordBits(password, salt, record.iterations);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

async function derivePasswordBits(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const saltBuffer = (salt.buffer as ArrayBuffer).slice(
    salt.byteOffset,
    salt.byteOffset + salt.byteLength,
  );
  const saltView = new Uint8Array(saltBuffer);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltView, iterations, hash: PASSWORD_HASH_ALGORITHM },
    keyMaterial,
    PASSWORD_HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, "base64"));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
