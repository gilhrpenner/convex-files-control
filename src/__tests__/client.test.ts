import { afterEach, describe, expect, test, vi } from "vitest";
import type { Auth, HttpRouter } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import {
  buildDownloadUrl,
  exposeApi,
  registerRoutes,
  uploadFormFields,
} from "../client/index.js";

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
    listAccessKeys: Symbol("listAccessKeys"),
    listDownloadGrants: Symbol("listDownloadGrants"),
    listFiles: Symbol("listFiles"),
    listFilesByAccessKey: Symbol("listFilesByAccessKey"),
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

describe("exposeApi", () => {
  test("routes auth and component operations", async () => {
    const auth = vi.fn(async () => {});
    const api = exposeApi(component, { auth });

    const runMutation = vi.fn(async (ref, args) => ({ ref, args }));
    const runQuery = vi.fn(async (ref, args) => ({ ref, args }));
    const ctx = makeCtx(runMutation, runQuery);

    const mutationCases = [
      {
        fn: api.generateUploadUrl,
        args: {},
        auth: { type: "generateUploadUrl" },
        ref: component.upload.generateUploadUrl,
      },
      {
        fn: api.finalizeUpload,
        args: {
          uploadToken: "token",
          storageId: "storage",
          accessKeys: ["a"],
          expiresAt: null,
        },
        auth: {
          type: "finalizeUpload",
          storageId: "storage",
          accessKeys: ["a"],
        },
        ref: component.upload.finalizeUpload,
      },
      {
        fn: api.registerFile,
        args: {
          storageId: "storage",
          accessKeys: ["a"],
          expiresAt: null,
          metadata: { size: 1, sha256: "hash", contentType: null },
        },
        auth: {
          type: "registerFile",
          storageId: "storage",
          accessKeys: ["a"],
        },
        ref: component.upload.registerFile,
      },
      {
        fn: api.createDownloadGrant,
        args: { storageId: "storage", maxUses: 2, expiresAt: null },
        auth: { type: "createDownloadGrant", storageId: "storage" },
        ref: component.download.createDownloadGrant,
      },
      {
        fn: api.consumeDownloadGrantForUrl,
        args: { downloadToken: "token", accessKey: "key" },
        auth: { type: "consumeDownloadGrantForUrl", downloadToken: "token" },
        ref: component.download.consumeDownloadGrantForUrl,
      },
      {
        fn: api.cleanupExpired,
        args: { limit: 5 },
        auth: { type: "cleanupExpired" },
        ref: component.cleanUp.cleanupExpired,
      },
      {
        fn: api.deleteFile,
        args: { storageId: "storage" },
        auth: { type: "deleteFile", storageId: "storage" },
        ref: component.cleanUp.deleteFile,
      },
      {
        fn: api.addAccessKey,
        args: { storageId: "storage", accessKey: "key" },
        auth: { type: "addAccessKey", storageId: "storage", accessKey: "key" },
        ref: component.accessControl.addAccessKey,
      },
      {
        fn: api.removeAccessKey,
        args: { storageId: "storage", accessKey: "key" },
        auth: {
          type: "removeAccessKey",
          storageId: "storage",
          accessKey: "key",
        },
        ref: component.accessControl.removeAccessKey,
      },
      {
        fn: api.updateFileExpiration,
        args: { storageId: "storage", expiresAt: null },
        auth: { type: "updateFileExpiration", storageId: "storage" },
        ref: component.accessControl.updateFileExpiration,
      },
    ];

    for (const entry of mutationCases) {
      auth.mockClear();
      runMutation.mockClear();
      const result = await getHandler(entry.fn)(ctx, entry.args);
      expect(auth).toHaveBeenCalledWith(ctx, entry.auth);
      expect(runMutation).toHaveBeenCalledWith(entry.ref, entry.args);
      expect(result).toEqual({ ref: entry.ref, args: entry.args });
    }

    const queryCases = [
      {
        fn: api.listFiles,
        args: {},
        auth: { type: "listFiles" },
        ref: component.queries.listFiles,
      },
      {
        fn: api.listFilesByAccessKey,
        args: { accessKey: "key" },
        auth: { type: "listFilesByAccessKey", accessKey: "key" },
        ref: component.queries.listFilesByAccessKey,
      },
      {
        fn: api.getFile,
        args: { storageId: "storage" },
        auth: { type: "getFile", storageId: "storage" },
        ref: component.queries.getFile,
      },
      {
        fn: api.listAccessKeys,
        args: { storageId: "storage" },
        auth: { type: "listAccessKeys", storageId: "storage" },
        ref: component.queries.listAccessKeys,
      },
      {
        fn: api.listDownloadGrants,
        args: {},
        auth: { type: "listDownloadGrants" },
        ref: component.queries.listDownloadGrants,
      },
      {
        fn: api.hasAccessKey,
        args: { storageId: "storage", accessKey: "key" },
        auth: { type: "hasAccessKey", storageId: "storage", accessKey: "key" },
        ref: component.queries.hasAccessKey,
      },
    ];

    for (const entry of queryCases) {
      auth.mockClear();
      runQuery.mockClear();
      const result = await getHandler(entry.fn)(ctx, entry.args);
      expect(auth).toHaveBeenCalledWith(ctx, entry.auth);
      expect(runQuery).toHaveBeenCalledWith(entry.ref, entry.args);
      expect(result).toEqual({ ref: entry.ref, args: entry.args });
    }
  });
});

describe("registerRoutes", () => {
  test("registers CORS preflight routes", async () => {
    const router = createRouter();
    registerRoutes(router, component);

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

  test("download route uses custom access key query param", async () => {
    const router = createRouter();
    registerRoutes(router, component, { accessKeyQueryParam: "key" });
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
        "https://example.com/files/download?token=token&key=custom",
      ),
    );

    expect(runMutation).toHaveBeenCalledWith(
      component.download.consumeDownloadGrantForUrl,
      { downloadToken: "token", accessKey: "custom" },
    );
  });

  test("upload route validates input", async () => {
    const router = createRouter();
    registerRoutes(router, component);
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

    const missingFileRequest = buildUploadRequest({
      [uploadFormFields.accessKeys]: JSON.stringify(["a"]),
    });
    const missingFileResponse = await handler(makeCtx(), missingFileRequest);
    expect(missingFileResponse.status).toBe(400);

    const missingAccessKeysRequest = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", { type: "text/plain" }),
    });
    const missingAccessKeysResponse = await handler(
      makeCtx(),
      missingAccessKeysRequest,
    );
    expect(missingAccessKeysResponse.status).toBe(400);

    const invalidAccessKeysRequest = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", { type: "text/plain" }),
      [uploadFormFields.accessKeys]: "not json",
    });
    const invalidAccessKeysResponse = await handler(
      makeCtx(),
      invalidAccessKeysRequest,
    );
    expect(invalidAccessKeysResponse.status).toBe(400);

    const invalidArrayRequest = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", { type: "text/plain" }),
      [uploadFormFields.accessKeys]: JSON.stringify([1]),
    });
    const invalidArrayResponse = await handler(makeCtx(), invalidArrayRequest);
    expect(invalidArrayResponse.status).toBe(400);

    const invalidTypeRequest = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", { type: "text/plain" }),
      [uploadFormFields.accessKeys]: JSON.stringify(["a"]),
      [uploadFormFields.expiresAt]: new File(["nope"], "filename"),
    });
    const invalidTypeResponse = await handler(makeCtx(), invalidTypeRequest);
    expect(invalidTypeResponse.status).toBe(400);

    const invalidNumberRequest = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", { type: "text/plain" }),
      [uploadFormFields.accessKeys]: JSON.stringify(["a"]),
      [uploadFormFields.expiresAt]: "nope",
    });
    const invalidNumberResponse = await handler(makeCtx(), invalidNumberRequest);
    expect(invalidNumberResponse.status).toBe(400);
  });

  test("upload route handles uploads", async () => {
    const router = createRouter();
    registerRoutes(router, component);
    const uploadRoute = getRoute(router, "/files/upload", "POST");
    const handler = getHandler(uploadRoute.handler);

    const uploadUrl = "https://upload.example.com";
    const uploadToken = "upload-token";
    const finalizeResult = {
      storageId: "storage",
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
        return { uploadUrl, uploadToken };
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
      [uploadFormFields.accessKeys]: JSON.stringify(["a", "b"]),
      [uploadFormFields.expiresAt]: "123",
    });

    const response = await handler(ctx, request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual(finalizeResult);

    expect(runMutation).toHaveBeenCalledWith(component.upload.generateUploadUrl, {});
    expect(runMutation).toHaveBeenCalledWith(component.upload.finalizeUpload, {
      uploadToken,
      storageId: "storage",
      accessKeys: ["a", "b"],
      expiresAt: 123,
    });

    const nullRequest = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", { type: "text/plain" }),
      [uploadFormFields.accessKeys]: JSON.stringify(["a"]),
      [uploadFormFields.expiresAt]: "null",
    });

    await handler(ctx, nullRequest);
    expect(runMutation).toHaveBeenCalledWith(component.upload.finalizeUpload, {
      uploadToken,
      storageId: "storage",
      accessKeys: ["a"],
      expiresAt: undefined,
    });

    const binaryRequest = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename"),
      [uploadFormFields.accessKeys]: JSON.stringify(["a"]),
    });

    await handler(ctx, binaryRequest);
    expect(fetchMock).toHaveBeenCalledWith(
      uploadUrl,
      expect.objectContaining({
        headers: { "Content-Type": "application/octet-stream" },
      }),
    );
  });

  test("upload route handles upstream failures", async () => {
    const router = createRouter();
    registerRoutes(router, component);
    const uploadRoute = getRoute(router, "/files/upload", "POST");
    const handler = getHandler(uploadRoute.handler);

    const uploadUrl = "https://upload.example.com";
    const runMutation = vi.fn(async (ref) => {
      if (ref === component.upload.generateUploadUrl) {
        return { uploadUrl, uploadToken: "token" };
      }
      return null;
    });

    const ctx = makeCtx(runMutation);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));

    const request = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "filename", { type: "text/plain" }),
      [uploadFormFields.accessKeys]: JSON.stringify(["a"]),
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
          "https://example.com/files/download?token=token&accessKey=key",
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
});

describe("helpers", () => {
  test("buildDownloadUrl builds expected URL", () => {
    const url = buildDownloadUrl({
      baseUrl: "https://example.com/",
      downloadToken: "token",
      accessKey: "key",
      filename: "file.txt",
    });
    expect(url).toBe(
      "https://example.com/files/download?token=token&accessKey=key&filename=file.txt",
    );
  });

  test("uploadFormFields exports expected keys", () => {
    expect(uploadFormFields).toEqual({
      file: "file",
      accessKeys: "accessKeys",
      expiresAt: "expiresAt",
    });
  });
});
