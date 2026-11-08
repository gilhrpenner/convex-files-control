import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../example/convex/schema.js";
import {
  api,
  components,
  internal,
} from "../../example/convex/_generated/api.js";
import { register } from "../test.js";

const modules = import.meta.glob("../../example/convex/**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  register(t);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { name: "Test user" }),
  );
  return { t, userId, user: t.withIdentity({ subject: userId }) };
}

describe("example integration", () => {
  it("rejects unauthenticated uploads", async () => {
    const { t } = await setup();
    await expect(
      t.mutation(api.files.generateUploadUrl, { provider: "convex" }),
    ).rejects.toThrow("not authenticated");
  });

  it("records HTTP uploads with matching component and example expiration", async () => {
    const { t, userId, user } = await setup();
    const file = await t.mutation(
      components.convexFilesControl.upload.registerFile,
      {
        storageId: "test-r2-key",
        storageProvider: "r2",
        accessKeys: [userId],
        metadata: { size: 4, sha256: "test", contentType: "text/plain" },
      },
    );
    const before = Date.now();
    await t.mutation(internal.files.recordUpload, {
      userId,
      storageId: file.storageId,
      storageProvider: "r2",
      fileName: "demo.txt",
      expiresAt: null,
      metadata: file.metadata,
    });
    const [upload] = await user.query(api.files.listUserUploads, {});
    expect(upload.expiresAt).toBeGreaterThanOrEqual(
      before + 24 * 60 * 60 * 1000,
    );
    const saved = await t.query(components.convexFilesControl.queries.getFile, {
      storageId: file.storageId,
    });
    expect(saved?.expiresAt).toBe(upload.expiresAt);
    const other = t.withIdentity({ subject: "another-user" });
    expect(await other.query(api.files.listUserUploads, {})).toEqual([]);
    await expect(
      other.mutation(api.files.deleteFile, { _id: upload._id }),
    ).rejects.toThrow("permission");
  });

  it("rejects oversized HTTP uploads before writing storage", async () => {
    const { user } = await setup();
    const body = new FormData();
    body.set(
      "file",
      new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]),
      "too-big.bin",
    );
    const response = await user.fetch("/files/upload", {
      method: "POST",
      body,
    });
    expect(response.status).toBe(413);
    expect(await user.query(api.files.listUserUploads, {})).toEqual([]);
  });
  it("rejects expired HTTP requests before creating a file", async () => {
    const { user } = await setup();
    const body = new FormData();
    body.set("file", new Blob(["hello"]), "expired.txt");
    body.set("expiresAt", "1");
    const response = await user.fetch("/files/upload", {
      method: "POST",
      body,
    });
    expect(response.status).toBe(400);
    expect(await user.query(api.files.listUserUploads, {})).toEqual([]);
  });
});
