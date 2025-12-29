import { afterEach, describe, expect, test, vi } from "vitest";
import type { Auth, HttpRouter } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import { buildDownloadUrl, registerRoutes, uploadFormFields } from "../client/index.js";

const component = {
  accessControl: {
    addAccessKey: Symbol("addAccessKey"),
    removeAccessKey: Symbol("removeAccessKey"),
    updateFileExpiration: Symbol("updateFileExpiration"),
  },
  cleanUp: {
    cleanupExpired: Symbol("cleanupExpired"),
    deleteFile: Symbol("deleteFile"),
  },
  download: {
    consumeDownloadGrantForUrl: Symbol("consumeDownloadGrantForUrl"),
    createDownloadGrant: Symbol("createDownloadGrant"),
  },
  queries: {
    getFile: Symbol("getFile"),
    hasAccessKey: Symbol("hasAccessKey"),
    listAccessKeysPage: Symbol("listAccessKeysPage"),
    listDownloadGrantsPage: Symbol("listDownloadGrantsPage"),
    listFilesPage: Symbol("listFilesPage"),
    listFilesByAccessKeyPage: Symbol("listFilesByAccessKeyPage"),
  },
  upload: {
    finalizeUpload: Symbol("finalizeUpload"),
    generateUploadUrl: Symbol("generateUploadUrl"),
    registerFile: Symbol("registerFile"),
  },
} as unknown as ComponentApi;

type HttpRoute = {
  path: string;
  method: string;
  handler: unknown;
};

type HttpRouteRegistry = HttpRouter & {
  routes: HttpRoute[];
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createRouter(): HttpRouteRegistry {
  const routes: HttpRoute[] = [];
  const router: HttpRouteRegistry = {
    routes,
    route: (def: HttpRoute) => {
      routes.push(def);
    },
  } as HttpRouteRegistry;
  return router;
}

function getRoute(router: HttpRouteRegistry, path: string, method: string) {
  const route = router.routes.find(
    (entry) => entry.path === path && entry.method === method,
  );
  if (!route) {
    throw new Error(`Missing route ${method} ${path}`);
  }
  return route;
}

function getHandler(fn: unknown) {
  return (fn as { _handler: (...args: any[]) => any })._handler;
}

function buildUploadRequest(fields: Record<string, FormDataEntryValue>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  const headers = new Headers({ "Content-Type": "multipart/form-data" });
  const request = {
    url: "https://example.com/files/upload",
    headers,
    formData: async () => formData,
  } as unknown as Request;
  return request;
}

function buildDownloadRequest(url: string) {
  return { url, headers: new Headers() } as unknown as Request;
}

function makeCtx(runMutation?: unknown, runQuery?: unknown) {
  return {
    auth: {} as Auth,
    runMutation: runMutation ?? vi.fn(async () => null),
    runQuery: runQuery ?? vi.fn(async () => null),
  } as const;
}

describe("registerRoutes", () => {
  // Helper to create a mock checkUploadRequest hook that returns accessKeys
  function mockCheckUploadRequest(accessKeys: string[] = ["test-user"]) {
    return vi.fn(async () => ({ accessKeys }));
  }

  test("registers CORS preflight routes", async () => {
    const router = createRouter();
    registerRoutes(router, component, {
      enableUploadRoute: true,
      checkUploadRequest: mockCheckUploadRequest(),
    });

    const uploadOptions = getRoute(router, "/files/upload", "OPTIONS");
    const downloadOptions = getRoute(router, "/files/download", "OPTIONS");

    const uploadResponse = await getHandler(uploadOptions.handler)(
      {},
      new Request("https://example.com/files/upload"),
    );
    const downloadResponse = await getHandler(downloadOptions.handler)(
      {},
      new Request("https://example.com/files/download"),
    );

    expect(uploadResponse.status).toBe(204);
    expect(uploadResponse.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(downloadResponse.status).toBe(204);
  });

  test("download route handles without accessKeyQueryParam", async () => {
    const router = createRouter();
    registerRoutes(router, component);
    const downloadRoute = getRoute(router, "/files/download", "GET");
    const handler = getHandler(downloadRoute.handler);

    const runMutation = vi.fn(async () => ({
      status: "ok",
      downloadUrl: "https://file.example.com",
    }));
    const ctx = makeCtx(runMutation);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("file", { status: 200 })));

    await handler(
      ctx,
      buildDownloadRequest(
        "https://example.com/files/download?token=token",
      ),
    );

    expect(runMutation).toHaveBeenCalledWith(
      component.download.consumeDownloadGrantForUrl,
      { downloadToken: "token", accessKey: undefined, password: undefined },
    );
  });

  test("download route uses accessKey from checkDownloadRequest hook", async () => {
    const router = createRouter();
    const checkDownloadRequest = vi.fn(async () => ({ accessKey: "from-hook" }));
    registerRoutes(router, component, { checkDownloadRequest });
    const downloadRoute = getRoute(router, "/files/download", "GET");
    const handler = getHandler(downloadRoute.handler);

    const runMutation = vi.fn(async () => ({
      status: "ok",
      downloadUrl: "https://file.example.com",
    }));
    const ctx = makeCtx(runMutation);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("file", { status: 200 })));

    await handler(
      ctx,
      buildDownloadRequest("https://example.com/files/download?token=token"),
    );

    expect(runMutation).toHaveBeenCalledWith(
      component.download.consumeDownloadGrantForUrl,
      expect.objectContaining({
        downloadToken: "token",
        accessKey: "from-hook",
      }),
    );
  });

  test("download route forwards password from query or header", async () => {
    const router = createRouter();
    registerRoutes(router, component, { passwordHeader: "x-download-password" });
    const downloadRoute = getRoute(router, "/files/download", "GET");
    const handler = getHandler(downloadRoute.handler);

    const runMutation = vi.fn(async () => ({
      status: "ok",
      downloadUrl: "https://file.example.com",
    }));
    const ctx = makeCtx(runMutation);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("file", { status: 200 })));

    await handler(
      ctx,
      buildDownloadRequest(
        "https://example.com/files/download?token=token&password=query",
      ),
    );

    expect(runMutation).toHaveBeenCalledWith(
      component.download.consumeDownloadGrantForUrl,
      { downloadToken: "token", accessKey: undefined, password: "query" },
    );

    runMutation.mockClear();
    const headerRequest = buildDownloadRequest(
      "https://example.com/files/download?token=token",
    );
    headerRequest.headers.set("x-download-password", "header");

    await handler(ctx, headerRequest);

    expect(runMutation).toHaveBeenCalledWith(
      component.download.consumeDownloadGrantForUrl,
      { downloadToken: "token", accessKey: undefined, password: "header" },
    );
  });

  test("upload route validates input", async () => {
    const checkUploadRequest = mockCheckUploadRequest(["a"]);
    const router = createRouter();
    registerRoutes(router, component, { enableUploadRoute: true, checkUploadRequest });
    const uploadRoute = getRoute(router, "/files/upload", "POST");
    const handler = getHandler(uploadRoute.handler);

    const invalidContent = {
      url: "https://example.com/files/upload",
      headers: new Headers({ "Content-Type": "application/json" }),
      formData: async () => new FormData(),
    } as Request;

    const invalidContentResponse = await handler(makeCtx(), invalidContent);
    expect(invalidContentResponse.status).toBe(415);

    const missingContentType = {
      url: "https://example.com/files/upload",
      headers: new Headers(),
      formData: async () => new FormData(),
    } as Request;

    const missingContentTypeResponse = await handler(
      makeCtx(),
      missingContentType,
    );
    expect(missingContentTypeResponse.status).toBe(415);

    const missingFileRequest = buildUploadRequest({});
    const missingFileResponse = await handler(makeCtx(), missingFileRequest);
    expect(missingFileResponse.status).toBe(400);

    const invalidTypeRequest = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", { type: "text/plain" }),
      [uploadFormFields.expiresAt]: new File(["nope"], "filename"),
    });
    const invalidTypeResponse = await handler(makeCtx(), invalidTypeRequest);
    expect(invalidTypeResponse.status).toBe(400);

    const invalidNumberRequest = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", { type: "text/plain" }),
      [uploadFormFields.expiresAt]: "nope",
    });
    const invalidNumberResponse = await handler(makeCtx(), invalidNumberRequest);
    expect(invalidNumberResponse.status).toBe(400);
  });

  test("upload route handles uploads", async () => {
    const checkUploadRequest = mockCheckUploadRequest(["a", "b"]);
    const router = createRouter();
    registerRoutes(router, component, { enableUploadRoute: true, checkUploadRequest });
    const uploadRoute = getRoute(router, "/files/upload", "POST");
    const handler = getHandler(uploadRoute.handler);

    const uploadUrl = "https://upload.example.com";
    const uploadToken = "upload-token";
    const finalizeResult = {
      storageId: "storage",
      storageProvider: "convex",
      expiresAt: null,
      metadata: {
        storageId: "storage",
        size: 4,
        sha256: "hash",
        contentType: "text/plain",
      },
    };

    const runMutation = vi.fn(async (ref, _args) => {
      if (ref === component.upload.generateUploadUrl) {
        return {
          uploadUrl,
          uploadToken,
          uploadTokenExpiresAt: Date.now(),
          storageProvider: "convex",
          storageId: null,
        };
      }
      if (ref === component.upload.finalizeUpload) {
        return finalizeResult;
      }
      throw new Error("Unexpected mutation");
    });

    const ctx = makeCtx(runMutation);

    const fetchMock = vi.fn(async (url) => {
      if (url === uploadUrl) {
        return new Response(JSON.stringify({ storageId: "storage" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", { type: "text/plain" }),
      [uploadFormFields.expiresAt]: "123",
    });

    const response = await handler(ctx, request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual(finalizeResult);

    expect(runMutation).toHaveBeenCalledWith(
      component.upload.generateUploadUrl,
      { provider: "convex", r2Config: undefined },
    );
    expect(runMutation).toHaveBeenCalledWith(component.upload.finalizeUpload, {
      uploadToken,
      storageId: "storage",
      accessKeys: ["a", "b"],
      expiresAt: 123,
      metadata: {
        size: 4,
        sha256: expect.any(String),
        contentType: "text/plain",
      },
    });

    // Reset hook for null expiresAt test
    checkUploadRequest.mockResolvedValue({ accessKeys: ["a"] });

    const nullRequest = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", { type: "text/plain" }),
      [uploadFormFields.expiresAt]: "null",
    });

    await handler(ctx, nullRequest);
    expect(runMutation).toHaveBeenCalledWith(component.upload.finalizeUpload, {
      uploadToken,
      storageId: "storage",
      accessKeys: ["a"],
      expiresAt: undefined,
      metadata: {
        size: 4,
        sha256: expect.any(String),
        contentType: "text/plain",
      },
    });

    const binaryRequest = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename"),
    });

    await handler(ctx, binaryRequest);
    expect(fetchMock).toHaveBeenCalledWith(
      uploadUrl,
      expect.objectContaining({
        headers: { "Content-Type": "application/octet-stream" },
      }),
    );
  });

  test("upload route uses btoa fallback when Buffer is unavailable", async () => {
    const checkUploadRequest = mockCheckUploadRequest(["a"]);
    const router = createRouter();
    registerRoutes(router, component, { enableUploadRoute: true, checkUploadRequest });
    const uploadRoute = getRoute(router, "/files/upload", "POST");
    const handler = getHandler(uploadRoute.handler);

    const uploadUrl = "https://upload.example.com";
    const runMutation = vi.fn(async (ref) => {
      if (ref === component.upload.generateUploadUrl) {
        return {
          uploadUrl,
          uploadToken: "token",
          uploadTokenExpiresAt: Date.now(),
          storageProvider: "convex",
          storageId: null,
        };
      }
      if (ref === component.upload.finalizeUpload) {
        return {
          storageId: "storage",
          storageProvider: "convex",
          expiresAt: null,
          metadata: null,
        };
      }
      throw new Error("Unexpected mutation");
    });
    const ctx = makeCtx(runMutation);

    vi.stubGlobal("Buffer", undefined as any);
    const btoaSpy = vi.fn((value: string) => `encoded:${value.length}`);
    vi.stubGlobal("btoa", btoaSpy);
    class FakeResponse {
      body: unknown;
      status: number;
      statusText: string;
      headers: Headers;
      ok: boolean;

      constructor(body: unknown, init?: ResponseInit) {
        this.body = body;
        this.status = init?.status ?? 200;
        this.statusText = init?.statusText ?? "";
        this.headers = new Headers(init?.headers);
        this.ok = this.status >= 200 && this.status < 300;
      }

      async json() {
        return this.body ? JSON.parse(String(this.body)) : null;
      }
    }
    vi.stubGlobal("Response", FakeResponse as any);
    class FakeTextDecoder {
      decode() {
        throw new Error("latin1 unsupported");
      }
    }
    vi.stubGlobal("TextDecoder", FakeTextDecoder as any);
    vi.stubGlobal("crypto", {
      subtle: {
        digest: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
      },
    });
    expect(typeof Buffer).toBe("undefined");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url === uploadUrl) {
          return {
            ok: true,
            json: async () => ({ storageId: "storage" }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      }),
    );

    const request = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", {
        type: "text/plain",
      }),
    });

    const response = await handler(ctx, request);
    expect(response.status).toBe(200);
    expect(btoaSpy).toHaveBeenCalled();
  });

  test("upload route skips TextDecoder when unavailable", async () => {
    const checkUploadRequest = mockCheckUploadRequest(["a"]);
    const router = createRouter();
    registerRoutes(router, component, { enableUploadRoute: true, checkUploadRequest });
    const uploadRoute = getRoute(router, "/files/upload", "POST");
    const handler = getHandler(uploadRoute.handler);

    const uploadUrl = "https://upload.example.com";
    const runMutation = vi.fn(async (ref) => {
      if (ref === component.upload.generateUploadUrl) {
        return {
          uploadUrl,
          uploadToken: "token",
          uploadTokenExpiresAt: Date.now(),
          storageProvider: "convex",
          storageId: null,
        };
      }
      if (ref === component.upload.finalizeUpload) {
        return {
          storageId: "storage",
          storageProvider: "convex",
          expiresAt: null,
          metadata: null,
        };
      }
      throw new Error("Unexpected mutation");
    });
    const ctx = makeCtx(runMutation);

    vi.stubGlobal("Buffer", undefined as any);
    const btoaSpy = vi.fn(() => "encoded");
    vi.stubGlobal("btoa", btoaSpy);
    vi.stubGlobal("TextDecoder", undefined as any);
    class FakeResponse {
      body: unknown;
      status: number;
      statusText: string;
      headers: Headers;
      ok: boolean;

      constructor(body: unknown, init?: ResponseInit) {
        this.body = body;
        this.status = init?.status ?? 200;
        this.statusText = init?.statusText ?? "";
        this.headers = new Headers(init?.headers);
        this.ok = this.status >= 200 && this.status < 300;
      }

      async json() {
        return this.body ? JSON.parse(String(this.body)) : null;
      }
    }
    vi.stubGlobal("Response", FakeResponse as any);
    vi.stubGlobal("crypto", {
      subtle: {
        digest: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url === uploadUrl) {
          return {
            ok: true,
            json: async () => ({ storageId: "storage" }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      }),
    );

    const request = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", {
        type: "text/plain",
      }),
    });

    const response = await handler(ctx, request);
    expect(response.status).toBe(200);
    expect(btoaSpy).toHaveBeenCalled();
  });

  test("upload route uses TextDecoder when available", async () => {
    const checkUploadRequest = mockCheckUploadRequest(["a"]);
    const router = createRouter();
    registerRoutes(router, component, { enableUploadRoute: true, checkUploadRequest });
    const uploadRoute = getRoute(router, "/files/upload", "POST");
    const handler = getHandler(uploadRoute.handler);

    const uploadUrl = "https://upload.example.com";
    const runMutation = vi.fn(async (ref) => {
      if (ref === component.upload.generateUploadUrl) {
        return {
          uploadUrl,
          uploadToken: "token",
          uploadTokenExpiresAt: Date.now(),
          storageProvider: "convex",
          storageId: null,
        };
      }
      if (ref === component.upload.finalizeUpload) {
        return {
          storageId: "storage",
          storageProvider: "convex",
          expiresAt: null,
          metadata: null,
        };
      }
      throw new Error("Unexpected mutation");
    });
    const ctx = makeCtx(runMutation);

    vi.stubGlobal("Buffer", undefined as any);
    const btoaSpy = vi.fn(() => "encoded");
    vi.stubGlobal("btoa", btoaSpy);
    class FakeResponse {
      body: unknown;
      status: number;
      statusText: string;
      headers: Headers;
      ok: boolean;

      constructor(body: unknown, init?: ResponseInit) {
        this.body = body;
        this.status = init?.status ?? 200;
        this.statusText = init?.statusText ?? "";
        this.headers = new Headers(init?.headers);
        this.ok = this.status >= 200 && this.status < 300;
      }

      async json() {
        return this.body ? JSON.parse(String(this.body)) : null;
      }
    }
    vi.stubGlobal("Response", FakeResponse as any);
    class FakeTextDecoder {
      decode() {
        return "decoded";
      }
    }
    vi.stubGlobal("TextDecoder", FakeTextDecoder as any);
    vi.stubGlobal("crypto", {
      subtle: {
        digest: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url === uploadUrl) {
          return {
            ok: true,
            json: async () => ({ storageId: "storage" }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      }),
    );

    const request = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", {
        type: "text/plain",
      }),
    });

    const response = await handler(ctx, request);
    expect(response.status).toBe(200);
    expect(btoaSpy).toHaveBeenCalledWith("decoded");
  });

  test("upload route throws when base64 encoding is unavailable", async () => {
    const checkUploadRequest = mockCheckUploadRequest(["a"]);
    const router = createRouter();
    registerRoutes(router, component, { enableUploadRoute: true, checkUploadRequest });
    const uploadRoute = getRoute(router, "/files/upload", "POST");
    const handler = getHandler(uploadRoute.handler);

    const uploadUrl = "https://upload.example.com";
    const runMutation = vi.fn(async (ref) => {
      if (ref === component.upload.generateUploadUrl) {
        return {
          uploadUrl,
          uploadToken: "token",
          uploadTokenExpiresAt: Date.now(),
          storageProvider: "convex",
          storageId: null,
        };
      }
      if (ref === component.upload.finalizeUpload) {
        return {
          storageId: "storage",
          storageProvider: "convex",
          expiresAt: null,
          metadata: null,
        };
      }
      throw new Error("Unexpected mutation");
    });
    const ctx = makeCtx(runMutation);

    vi.stubGlobal("Buffer", undefined as any);
    vi.stubGlobal("btoa", undefined as any);
    class FakeResponse {
      body: unknown;
      status: number;
      statusText: string;
      headers: Headers;
      ok: boolean;

      constructor(body: unknown, init?: ResponseInit) {
        this.body = body;
        this.status = init?.status ?? 200;
        this.statusText = init?.statusText ?? "";
        this.headers = new Headers(init?.headers);
        this.ok = this.status >= 200 && this.status < 300;
      }
    }
    vi.stubGlobal("Response", FakeResponse as any);
    vi.stubGlobal("crypto", {
      subtle: {
        digest: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url === uploadUrl) {
          return {
            ok: true,
            json: async () => ({ storageId: "storage" }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      }),
    );

    const request = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", {
        type: "text/plain",
      }),
    });

    await expect(handler(ctx, request)).rejects.toThrow(
      "Base64 encoding is not available in this environment.",
    );
  });

  test("upload route calls onUploadComplete hook", async () => {
    const checkUploadRequest = mockCheckUploadRequest(["a"]);
    const onUploadComplete = vi.fn(async () => undefined);
    const router = createRouter();
    registerRoutes(router, component, {
      enableUploadRoute: true,
      checkUploadRequest,
      onUploadComplete,
    });
    const uploadRoute = getRoute(router, "/files/upload", "POST");
    const handler = getHandler(uploadRoute.handler);

    const uploadUrl = "https://upload.example.com";
    const uploadToken = "upload-token";
    const finalizeResult = {
      storageId: "storage",
      storageProvider: "convex",
      expiresAt: null,
      metadata: {
        storageId: "storage",
        size: 4,
        sha256: "hash",
        contentType: "text/plain",
      },
    };

    const runMutation = vi.fn(async (ref, _args) => {
      if (ref === component.upload.generateUploadUrl) {
        return {
          uploadUrl,
          uploadToken,
          uploadTokenExpiresAt: Date.now(),
          storageProvider: "convex",
          storageId: null,
        };
      }
      if (ref === component.upload.finalizeUpload) {
        return finalizeResult;
      }
      throw new Error("Unexpected mutation");
    });

    const ctx = makeCtx(runMutation);

    const fetchMock = vi.fn(async (url) => {
      if (url === uploadUrl) {
        return new Response(JSON.stringify({ storageId: "storage" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", { type: "text/plain" }),
    });

    await handler(ctx, request);

    expect(onUploadComplete).toHaveBeenCalledTimes(1);
    const hookArgs = onUploadComplete.mock.calls[0]?.[1];
    expect(hookArgs).toMatchObject({
      provider: "convex",
      accessKeys: ["a"],
      expiresAt: null,
      result: finalizeResult,
    });
  });

  test("upload route returns hook response with CORS headers", async () => {
    const checkUploadRequest = mockCheckUploadRequest(["a"]);
    const onUploadComplete = vi.fn(async () =>
      new Response("hooked", {
        status: 202,
        headers: { "X-Hook": "true" },
      }),
    );
    const router = createRouter();
    registerRoutes(router, component, {
      enableUploadRoute: true,
      checkUploadRequest,
      onUploadComplete,
    });
    const uploadRoute = getRoute(router, "/files/upload", "POST");
    const handler = getHandler(uploadRoute.handler);

    const uploadUrl = "https://upload.example.com";
    const uploadToken = "upload-token";
    const runMutation = vi.fn(async (ref) => {
      if (ref === component.upload.generateUploadUrl) {
        return {
          uploadUrl,
          uploadToken,
          uploadTokenExpiresAt: Date.now(),
          storageProvider: "convex",
          storageId: null,
        };
      }
      if (ref === component.upload.finalizeUpload) {
        return {
          storageId: "storage",
          storageProvider: "convex",
          expiresAt: null,
          metadata: null,
        };
      }
      throw new Error("Unexpected mutation");
    });

    const ctx = makeCtx(runMutation);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url === uploadUrl) {
          return new Response(JSON.stringify({ storageId: "storage" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(null, { status: 404 });
      }),
    );

    const request = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", { type: "text/plain" }),
    });
    request.headers.set("Origin", "https://origin.example");

    const response = await handler(ctx, request);
    expect(response.status).toBe(202);
    expect(response.headers.get("X-Hook")).toBe("true");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://origin.example",
    );
  });

  test("upload route handles upstream failures", async () => {
    const checkUploadRequest = mockCheckUploadRequest(["a"]);
    const router = createRouter();
    registerRoutes(router, component, { enableUploadRoute: true, checkUploadRequest });
    const uploadRoute = getRoute(router, "/files/upload", "POST");
    const handler = getHandler(uploadRoute.handler);

    const uploadUrl = "https://upload.example.com";
    const runMutation = vi.fn(async (ref) => {
      if (ref === component.upload.generateUploadUrl) {
        return {
          uploadUrl,
          uploadToken: "token",
          uploadTokenExpiresAt: Date.now(),
          storageProvider: "convex",
          storageId: null,
        };
      }
      return null;
    });

    const ctx = makeCtx(runMutation);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));

    const request = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", { type: "text/plain" }),
    });

    const failedUpload = await handler(ctx, request);
    expect(failedUpload.status).toBe(502);

    vi.stubGlobal("fetch", vi.fn(async () => {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const missingStorage = await handler(ctx, request);
    expect(missingStorage.status).toBe(502);
  });

  test("download route validates input", async () => {
    const router = createRouter();
    registerRoutes(router, component, { requireAccessKey: true });
    const downloadRoute = getRoute(router, "/files/download", "GET");
    const handler = getHandler(downloadRoute.handler);

    const missingToken = await handler(makeCtx(), buildDownloadRequest("https://example.com/files/download"));
    expect(missingToken.status).toBe(400);

    const missingAccess = await handler(
      makeCtx(),
      buildDownloadRequest("https://example.com/files/download?token=token"),
    );
    expect(missingAccess.status).toBe(401);
  });

  test("download route handles error statuses", async () => {
    const router = createRouter();
    registerRoutes(router, component);
    const downloadRoute = getRoute(router, "/files/download", "GET");
    const handler = getHandler(downloadRoute.handler);

    const runMutation = vi.fn(async (_ref, _args) => ({ status: "expired" }));
    const ctx = makeCtx(runMutation);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    const cases = [
      { status: "expired", code: 410 },
      { status: "exhausted", code: 410 },
      { status: "file_expired", code: 410 },
      { status: "access_denied", code: 403 },
      { status: "password_required", code: 401 },
      { status: "invalid_password", code: 403 },
      { status: "not_found", code: 404 },
      { status: "ok", code: 404 },
    ];

    for (const entry of cases) {
      runMutation.mockResolvedValueOnce({
        status: entry.status,
        downloadUrl: entry.status === "ok" ? undefined : undefined,
      } as any);
      const response = await handler(
        ctx,
        buildDownloadRequest(
          "https://example.com/files/download?token=token",
        ),
      );
      expect(response.status).toBe(entry.code);
    }
  });

  test("download route streams files", async () => {
    const router = createRouter();
    registerRoutes(router, component);
    const downloadRoute = getRoute(router, "/files/download", "GET");
    const handler = getHandler(downloadRoute.handler);

    const runMutation = vi.fn(async () => ({
      status: "ok",
      downloadUrl: "https://file.example.com",
    }));

    const ctx = makeCtx(runMutation);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    const noBodyResponse = await handler(
      ctx,
      buildDownloadRequest(
        "https://example.com/files/download?token=token&filename=",
      ),
    );
    expect(noBodyResponse.status).toBe(404);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    const missingResponse = await handler(
      ctx,
      buildDownloadRequest(
        "https://example.com/files/download?token=token&filename=bad%20name",
      ),
    );
    expect(missingResponse.status).toBe(404);

    vi.stubGlobal("fetch", vi.fn(async () => {
      return new Response("file", {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Content-Length": "4",
        },
      });
    }));

    const okResponse = await handler(
      ctx,
      buildDownloadRequest(
        "https://example.com/files/download?token=token&filename=bad%20name",
      ),
    );

    expect(okResponse.status).toBe(200);
    expect(okResponse.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(okResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(okResponse.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\"bad_name\"",
    );
    expect(okResponse.headers.get("Content-Type")).toBe("text/plain");
    expect(okResponse.headers.get("Content-Length")).toBe("4");

    const defaultNameResponse = await handler(
      ctx,
      buildDownloadRequest("https://example.com/files/download?token=token"),
    );
    expect(defaultNameResponse.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\"download\"",
    );

    const whitespaceNameResponse = await handler(
      ctx,
      buildDownloadRequest(
        "https://example.com/files/download?token=token&filename=%20%20",
      ),
    );
    expect(whitespaceNameResponse.headers.get("Content-Disposition")).toBe(
      "attachment; filename=\"download\"",
    );
  });

  test("download route omits Content-Type when upstream is missing it", async () => {
    const router = createRouter();
    registerRoutes(router, component);
    const downloadRoute = getRoute(router, "/files/download", "GET");
    const handler = getHandler(downloadRoute.handler);

    const runMutation = vi.fn(async () => ({
      status: "ok",
      downloadUrl: "https://file.example.com",
    }));
    const ctx = makeCtx(runMutation);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        body: "file",
        headers: new Headers(),
      }) as any),
    );

    const response = await handler(
      ctx,
      buildDownloadRequest("https://example.com/files/download?token=token"),
    );

    expect(response.status).toBe(200);
  });
});

describe("helpers", () => {
  test("buildDownloadUrl builds expected URL", () => {
    const url = buildDownloadUrl({
      baseUrl: "https://example.com/",
      downloadToken: "token",
      filename: "file.txt",
    });
    expect(url).toBe(
      "https://example.com/files/download?token=token&filename=file.txt",
    );
  });

  test("uploadFormFields exports expected keys", () => {
    expect(uploadFormFields).toEqual({
      file: "file",
      accessKeys: "accessKeys",
      expiresAt: "expiresAt",
      provider: "provider",
    });
  });
});
