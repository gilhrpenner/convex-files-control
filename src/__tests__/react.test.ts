import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("react", () => ({
  useCallback: (fn: any) => fn,
}));

vi.mock("convex/react", () => ({
  useMutation: (fn: any) => fn,
}));

import { useUploadFile } from "../react/index.js";
import { uploadFormFields } from "../shared/forms.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useUploadFile", () => {
  test("presigned upload uses convex flow", async () => {
    const uploadUrl = "https://upload.example.com";
    const uploadToken = "token";
    const generateUploadUrl = vi.fn(async () => ({
      uploadUrl,
      uploadToken,
      uploadTokenExpiresAt: Date.now(),
      storageProvider: "convex",
      storageId: null,
    }));
    const finalizeUpload = vi.fn(async (args: any) => ({
      storageId: args.storageId,
      storageProvider: "convex",
      expiresAt: args.expiresAt ?? null,
      metadata: null,
    }));

    const api = { generateUploadUrl, finalizeUpload } as any;
    const { uploadViaPresignedUrl } = useUploadFile(api);

    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ storageId: "storage" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["data"], "file.txt", { type: "text/plain" });
    const result = await uploadViaPresignedUrl({
      file,
      expiresAt: 123,
    });

    expect(result.storageId).toBe("storage");
    expect(generateUploadUrl).toHaveBeenCalledWith({ provider: "convex" });
    expect(finalizeUpload).toHaveBeenCalledWith({
      uploadToken,
      storageId: "storage",
      expiresAt: 123,
      fileName: "file.txt",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      uploadUrl,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "text/plain" },
      }),
    );
  });

  test("presigned upload handles r2 and binary content", async () => {
    const uploadUrl = "https://r2-upload.example.com";
    const generateUploadUrl = vi.fn(async () => ({
      uploadUrl,
      uploadToken: "token",
      uploadTokenExpiresAt: Date.now(),
      storageProvider: "r2",
      storageId: "preset",
    }));
    const finalizeUpload = vi.fn(async (args: any) => ({
      storageId: args.storageId,
      storageProvider: "r2",
      expiresAt: null,
      metadata: null,
    }));

    const api = { generateUploadUrl, finalizeUpload } as any;
    const { uploadViaPresignedUrl } = useUploadFile(api);

    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["data"], "file.bin");
    const result = await uploadViaPresignedUrl({
      file,
      provider: "r2",
    });

    expect(result.storageId).toBe("preset");
    expect(fetchMock).toHaveBeenCalledWith(
      uploadUrl,
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
      }),
    );
  });

  test("presigned upload throws on failure or missing storageId", async () => {
    const uploadUrl = "https://upload.example.com";
    const generateUploadUrl = vi.fn(async () => ({
      uploadUrl,
      uploadToken: "token",
      uploadTokenExpiresAt: Date.now(),
      storageProvider: "convex",
      storageId: null,
    }));
    const finalizeUpload = vi.fn();
    const api = { generateUploadUrl, finalizeUpload } as any;
    const { uploadViaPresignedUrl } = useUploadFile(api);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500, statusText: "bad" })),
    );

    await expect(
      uploadViaPresignedUrl({
        file: new File(["data"], "file.txt"),
      }),
    ).rejects.toThrow("Upload failed: bad");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      uploadViaPresignedUrl({
        file: new File(["data"], "file.txt"),
      }),
    ).rejects.toThrow("Upload did not return a storageId.");
  });

  test("http upload builds url and handles errors", async () => {
    const api = {
      generateUploadUrl: vi.fn(),
      finalizeUpload: vi.fn(),
    } as any;

    const { uploadViaHttpAction } = useUploadFile(api);

    await expect(
      uploadViaHttpAction({
        file: new File(["data"], "file.txt"),
      }),
    ).rejects.toThrow("Missing HTTP upload URL");

    await expect(
      uploadViaHttpAction({
        file: new File(["data"], "file.txt"),
        http: {},
      }),
    ).rejects.toThrow("Missing HTTP upload URL");

    const errorFetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Bad request" }), { status: 400 }),
    );
    vi.stubGlobal("fetch", errorFetch);

    await expect(
      uploadViaHttpAction({
        file: new File(["data"], "file.txt"),
        http: { uploadUrl: "https://upload.example.com" },
      }),
    ).rejects.toThrow("Bad request");

    const invalidJsonFetch = vi.fn(async () =>
      new Response("not json", { status: 500 }),
    );
    vi.stubGlobal("fetch", invalidJsonFetch);

    await expect(
      uploadViaHttpAction({
        file: new File(["data"], "file.txt"),
        http: { uploadUrl: "https://upload.example.com" },
      }),
    ).rejects.toThrow("HTTP upload failed.");
  });

  test("http upload sends form data and returns payload", async () => {
    const api = {
      generateUploadUrl: vi.fn(),
      finalizeUpload: vi.fn(),
    } as any;

    const { uploadViaHttpAction } = useUploadFile(api);

    const responsePayload = {
      storageId: "storage",
      storageProvider: "convex",
      expiresAt: null,
      metadata: null,
    };

    const fetchMock = vi.fn(async (_url: string, init?: any) => {
      expect(init?.body).toBeInstanceOf(FormData);
      const form = init?.body as FormData;
      // Note: accessKeys is NOT in form - it's added server-side via checkUploadRequest hook
      expect(form.get(uploadFormFields.provider)).toBe("convex");
      expect(form.get(uploadFormFields.expiresAt)).toBe("null");
      return new Response(JSON.stringify(responsePayload), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadViaHttpAction({
      file: new File(["data"], "file.txt"),
      expiresAt: null,
      http: { baseUrl: "https://example.com", pathPrefix: "/files" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/files/upload",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual(responsePayload);
  });

  test("http upload defaults pathPrefix and stringifies expiresAt", async () => {
    const api = {
      generateUploadUrl: vi.fn(),
      finalizeUpload: vi.fn(),
    } as any;

    const { uploadViaHttpAction } = useUploadFile(api);

    const fetchMock = vi.fn(async (_url: string, init?: any) => {
      const form = init?.body as FormData;
      expect(form.get(uploadFormFields.expiresAt)).toBe("123");
      return new Response(
        JSON.stringify({
          storageId: "storage",
          storageProvider: "convex",
          expiresAt: 123,
          metadata: null,
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await uploadViaHttpAction({
      file: new File(["data"], "file.txt"),
      expiresAt: 123,
      http: { baseUrl: "https://example.com" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/files/upload",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("uploadFile chooses method based on options and args", async () => {
    const uploadUrl = "https://upload.example.com";
    const generateUploadUrl = vi.fn(async () => ({
      uploadUrl,
      uploadToken: "token",
      uploadTokenExpiresAt: Date.now(),
      storageProvider: "convex",
      storageId: null,
    }));
    const finalizeUpload = vi.fn(async (args: any) => ({
      storageId: args.storageId,
      storageProvider: "convex",
      expiresAt: null,
      metadata: null,
    }));

    const api = { generateUploadUrl, finalizeUpload } as any;
    const { uploadFile } = useUploadFile(api, {
      method: "http",
      http: { uploadUrl: "https://upload.example.com" },
    });

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        storageId: "storage",
        storageProvider: "convex",
        expiresAt: null,
        metadata: null,
      }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await uploadFile({
      file: new File(["data"], "file.txt"),
    });

    expect(fetchMock).toHaveBeenCalled();

    await uploadFile({
      file: new File(["data"], "file.txt"),
      method: "presigned",
    });

    expect(generateUploadUrl).toHaveBeenCalled();
  });

  test("uploadFile defaults to presigned when method unset", async () => {
    const uploadUrl = "https://upload.example.com";
    const generateUploadUrl = vi.fn(async () => ({
      uploadUrl,
      uploadToken: "token",
      uploadTokenExpiresAt: Date.now(),
      storageProvider: "convex",
      storageId: null,
    }));
    const finalizeUpload = vi.fn(async (args: any) => ({
      storageId: args.storageId,
      storageProvider: "convex",
      expiresAt: null,
      metadata: null,
    }));

    const api = { generateUploadUrl, finalizeUpload } as any;
    const { uploadFile } = useUploadFile(api);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ storageId: "storage" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await uploadFile({
      file: new File(["data"], "file.txt"),
    });

    expect(generateUploadUrl).toHaveBeenCalled();
  });
});
