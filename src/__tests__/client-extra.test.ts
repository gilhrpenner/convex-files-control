import { afterEach, describe, expect, test, vi } from "vitest";
import type { Auth, HttpRouter } from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import {
  buildDownloadUrl,
  FilesControl,
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
    getFileByVirtualPath: Symbol("getFileByVirtualPath"),
    hasAccessKey: Symbol("hasAccessKey"),
    listAccessKeysPage: Symbol("listAccessKeysPage"),
    listDownloadGrantsPage: Symbol("listDownloadGrantsPage"),
    listFilesPage: Symbol("listFilesPage"),
    listFilesByAccessKeyPage: Symbol("listFilesByAccessKeyPage"),
  },
  transfer: {
    transferFile: Symbol("transferFile"),
  },
  upload: {
    computeR2Metadata: Symbol("computeR2Metadata"),
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
  return router.routes.find(
    (entry) => entry.path === path && entry.method === method,
  );
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

function makeCtx(runMutation?: unknown, runQuery?: unknown, runAction?: unknown) {
  return {
    auth: {} as Auth,
    runMutation: runMutation ?? vi.fn(async () => null),
    runQuery: runQuery ?? vi.fn(async () => null),
    runAction: runAction ?? vi.fn(async () => null),
  } as const;
}

describe("registerRoutes extra coverage", () => {
  // Helper to create a mock checkUploadRequest hook that returns accessKeys
  function mockCheckUploadRequest(accessKeys: string[] = ["test-user"]) {
    return vi.fn(async () => ({ accessKeys }));
  }

  test("skips download route when disabled", () => {
    const router = createRouter();
    registerRoutes(router, component, {
      enableUploadRoute: true,
      enableDownloadRoute: false,
      checkUploadRequest: mockCheckUploadRequest(),
    });

    expect(getRoute(router, "/files/download", "GET")).toBeUndefined();
    expect(getRoute(router, "/files/upload", "POST")).toBeDefined();
  });

  test("upload route requires checkUploadRequest when enabled", () => {
    const router = createRouter();
    expect(() =>
      registerRoutes(router, component, { enableUploadRoute: true }),
    ).toThrow(
      "checkUploadRequest is required when enableUploadRoute is true. This hook must authenticate the request and return { accessKeys }.",
    );
  });

  test("download route short-circuits with checkDownloadRequest", async () => {
    const router = createRouter();
    const checkDownloadRequest = vi.fn(() =>
      new Response("blocked", { status: 429 }),
    );
    registerRoutes(router, component, { checkDownloadRequest });

    const downloadRoute = getRoute(router, "/files/download", "GET");
    const handler = getHandler(downloadRoute?.handler);

    const runMutation = vi.fn();
    const ctx = makeCtx(runMutation);

    const response = await handler(
      ctx,
      buildDownloadRequest("https://example.com/files/download?token=token"),
    );

    expect(response.status).toBe(429);
    expect(runMutation).not.toHaveBeenCalled();
  });

  test("download route uses accessKey from checkDownloadRequest", async () => {
    const router = createRouter();
    const checkDownloadRequest = vi.fn(async () => ({ accessKey: "from-hook" }));
    registerRoutes(router, component, { checkDownloadRequest });

    const downloadRoute = getRoute(router, "/files/download", "GET");
    const handler = getHandler(downloadRoute?.handler);

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
        password: undefined,
      }),
    );
  });

  test("download route ignores checkDownloadRequest without accessKey", async () => {
    const router = createRouter();
    const checkDownloadRequest = vi.fn(async () => ({}));
    registerRoutes(router, component, { checkDownloadRequest });

    const downloadRoute = getRoute(router, "/files/download", "GET");
    const handler = getHandler(downloadRoute?.handler);

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
        accessKey: undefined,
      }),
    );
  });

  test("download route reads r2 config from env and handles disabled password params", async () => {
    process.env.R2_ACCOUNT_ID = "acct";
    process.env.R2_ACCESS_KEY_ID = "access";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    process.env.R2_BUCKET_NAME = "bucket";

    const router = createRouter();
    registerRoutes(router, component, {
      passwordHeader: "",
      passwordQueryParam: "",
    });
    const downloadRoute = getRoute(router, "/files/download", "GET");
    const handler = getHandler(downloadRoute?.handler);

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
      {
        downloadToken: "token",
        accessKey: undefined,
        password: undefined,
        r2Config: {
          accountId: "acct",
          accessKeyId: "access",
          secretAccessKey: "secret",
          bucketName: "bucket",
        },
      },
    );

    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;
  });

  test("upload route rejects invalid checkUploadRequest results", async () => {
    const router = createRouter();
    const checkUploadRequest = vi.fn(async () => null);
    registerRoutes(router, component, {
      enableUploadRoute: true,
      checkUploadRequest,
    });

    const uploadRoute = getRoute(router, "/files/upload", "POST");
    const handler = getHandler(uploadRoute?.handler);

    const request = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "name.txt", {
        type: "text/plain",
      }),
    });

    const response = await handler(makeCtx(), request);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "checkUploadRequest must return accessKeys",
    });
  });

  test("upload route short-circuits when checkUploadRequest returns Response", async () => {
    const router = createRouter();
    const checkUploadRequest = vi.fn(async () =>
      new Response("blocked", { status: 401 }),
    );
    registerRoutes(router, component, {
      enableUploadRoute: true,
      checkUploadRequest,
    });

    const uploadRoute = getRoute(router, "/files/upload", "POST");
    const handler = getHandler(uploadRoute?.handler);

    const request = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "name.txt", {
        type: "text/plain",
      }),
    });
    request.headers.set("Origin", "https://origin.example");

    const response = await handler(makeCtx(), request);
    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://origin.example",
    );
  });

  test("upload route rejects empty accessKeys", async () => {
    const router = createRouter();
    const checkUploadRequest = vi.fn(async () => ({ accessKeys: [] }));
    registerRoutes(router, component, {
      enableUploadRoute: true,
      checkUploadRequest,
    });

    const uploadRoute = getRoute(router, "/files/upload", "POST");
    const handler = getHandler(uploadRoute?.handler);

    const request = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "name.txt", {
        type: "text/plain",
      }),
    });

    const response = await handler(makeCtx(), request);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "checkUploadRequest must return accessKeys",
    });
  });

  test("upload route fails when r2 config missing", async () => {
    const checkUploadRequest = mockCheckUploadRequest(["a"]);
    const router = createRouter();
    registerRoutes(router, component, {
      enableUploadRoute: true,
      defaultUploadProvider: "r2",
      checkUploadRequest,
    });

    const uploadRoute = getRoute(router, "/files/upload", "POST");
    const handler = getHandler(uploadRoute?.handler);

    const request = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "name.txt", {
        type: "text/plain",
      }),
    });

    const response = await handler(makeCtx(), request);
    expect(response.status).toBe(500);
  });

  test("upload route supports r2 provider and invalid provider defaults", async () => {
    const checkUploadRequest = mockCheckUploadRequest(["a"]);
    const router = createRouter();
    registerRoutes(router, component, {
      enableUploadRoute: true,
      defaultUploadProvider: "convex",
      checkUploadRequest,
      r2: {
        accountId: "acct",
        accessKeyId: "access",
        secretAccessKey: "secret",
        bucketName: "bucket",
      },
    });

    const uploadRoute = getRoute(router, "/files/upload", "POST");
    const handler = getHandler(uploadRoute?.handler);

    const runMutation = vi.fn(async (ref: unknown, args: any) => {
      if (ref === component.upload.generateUploadUrl) {
        return {
          uploadUrl: "https://upload.example.com",
          uploadToken: "token",
          uploadTokenExpiresAt: Date.now(),
          storageProvider: args.provider,
          storageId: args.provider === "r2" ? "r2-storage" : null,
        };
      }
      if (ref === component.upload.finalizeUpload) {
        return {
          storageId: args.storageId,
          storageProvider: args.storageProvider ?? "r2",
          expiresAt: null,
          metadata: null,
        };
      }
      return null;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "PUT") {
          return new Response("", { status: 200 });
        }
        return new Response(JSON.stringify({ storageId: "storage" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const r2Request = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "name.bin"),
      [uploadFormFields.provider]: "r2",
    });

    await handler(makeCtx(runMutation), r2Request);

    expect(runMutation).toHaveBeenCalledWith(
      component.upload.generateUploadUrl,
      {
        provider: "r2",
        r2Config: {
          accountId: "acct",
          accessKeyId: "access",
          secretAccessKey: "secret",
          bucketName: "bucket",
        },
      },
    );

    const invalidProviderRequest = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "name.txt", {
        type: "text/plain",
      }),
      [uploadFormFields.provider]: "nope",
    });

    await handler(makeCtx(runMutation), invalidProviderRequest);

    expect(runMutation).toHaveBeenCalledWith(
      component.upload.generateUploadUrl,
      { provider: "convex", r2Config: undefined },
    );
  });

  test("upload route handles non-Error throws", async () => {
    const checkUploadRequest = mockCheckUploadRequest(["a"]);
    const router = createRouter();
    registerRoutes(router, component, {
      enableUploadRoute: true,
      defaultUploadProvider: "r2",
      checkUploadRequest,
    });

    const uploadRoute = getRoute(router, "/files/upload", "POST");
    const handler = getHandler(uploadRoute?.handler);

    const request = buildUploadRequest({
      [uploadFormFields.file]: new File(["file"], "name.txt", {
        type: "text/plain",
      }),
    });

    const OriginalError = globalThis.Error;
    function FakeError() {
      return { message: "boom" };
    }
    (FakeError as any).captureStackTrace = OriginalError.captureStackTrace;
    vi.stubGlobal("Error", FakeError as any);

    const response = await handler(makeCtx(), request);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "R2 configuration missing." });
  });
});

describe("buildDownloadUrl", () => {
  test("omits optional query params", () => {
    const url = buildDownloadUrl({
      baseUrl: "https://example.com/",
      downloadToken: "token",
      pathPrefix: "/files",
    });
    expect(url).toBe("https://example.com/files/download?token=token");
  });
});

describe("FilesControl class and clientApi", () => {
  const r2Config = {
    accountId: "acct",
    accessKeyId: "access",
    secretAccessKey: "secret",
    bucketName: "bucket",
  };

  function buildMutationMocks(overrides?: {
    deleteFile?: { deleted: boolean };
  }) {
    return vi.fn(async (ref: unknown, args: any) => {
      if (ref === component.upload.generateUploadUrl) {
        return {
          uploadUrl: "https://upload.example.com",
          uploadToken: "upload-token",
          uploadTokenExpiresAt: 123,
          storageProvider: args.provider ?? "convex",
          storageId: args.provider === "r2" ? "r2-storage" : null,
        };
      }
      if (ref === component.upload.finalizeUpload) {
        return {
          storageId: args.storageId,
          storageProvider: "convex",
          expiresAt: args.expiresAt ?? null,
          metadata: args.metadata
            ? { ...args.metadata, storageId: args.storageId }
            : null,
        };
      }
      if (ref === component.upload.registerFile) {
        return {
          storageId: args.storageId,
          storageProvider: args.storageProvider,
          expiresAt: args.expiresAt ?? null,
          metadata: args.metadata
            ? { ...args.metadata, storageId: args.storageId }
            : null,
        };
      }
      if (ref === component.download.createDownloadGrant) {
        return {
          downloadToken: "grant-token",
          storageId: args.storageId,
          expiresAt: args.expiresAt ?? null,
          maxUses: args.maxUses ?? null,
        };
      }
      if (ref === component.download.consumeDownloadGrantForUrl) {
        return {
          status: "ok",
          downloadUrl: "https://download.example.com",
        };
      }
      if (ref === component.accessControl.addAccessKey) {
        return { accessKey: args.accessKey };
      }
      if (ref === component.accessControl.removeAccessKey) {
        return { removed: true };
      }
      if (ref === component.accessControl.updateFileExpiration) {
        return { expiresAt: args.expiresAt };
      }
      if (ref === component.cleanUp.deleteFile) {
        return overrides?.deleteFile ?? { deleted: true };
      }
      if (ref === component.cleanUp.cleanupExpired) {
        return { deletedCount: 1, hasMore: false };
      }
      return null;
    });
  }

  function buildQueryMocks(options?: { returnNullFile?: boolean }) {
    const file = {
      _id: "file-id",
      storageId: "storage",
      storageProvider: "convex",
      expiresAt: null,
      virtualPath: "/path/file.txt",
    };
    const grant = {
      _id: "grant-id",
      storageId: "storage",
      expiresAt: null,
      maxUses: 2,
      useCount: 1,
      hasPassword: false,
    };
    return vi.fn(async (ref: unknown) => {
      if (ref === component.queries.getFile) {
        return options?.returnNullFile ? null : file;
      }
      if (ref === component.queries.getFileByVirtualPath) {
        return options?.returnNullFile ? null : file;
      }
      if (ref === component.queries.listFilesPage) {
        return { page: [file], isDone: true, continueCursor: null };
      }
      if (ref === component.queries.listFilesByAccessKeyPage) {
        return { page: [file], isDone: true, continueCursor: null };
      }
      if (ref === component.queries.listAccessKeysPage) {
        return { page: ["key"], isDone: true, continueCursor: null };
      }
      if (ref === component.queries.listDownloadGrantsPage) {
        return { page: [grant], isDone: true, continueCursor: null };
      }
      if (ref === component.queries.hasAccessKey) {
        return true;
      }
      return null;
    });
  }

  function buildActionMocks() {
    return vi.fn(async (ref: unknown, args: any) => {
      if (ref === component.upload.computeR2Metadata) {
        return {
          storageId: args.storageId,
          size: 1,
          sha256: "hash",
          contentType: null,
        };
      }
      if (ref === component.transfer.transferFile) {
        return {
          storageId: args.storageId,
          storageProvider: args.targetProvider,
        };
      }
      return null;
    });
  }

  test("FilesControl methods pass r2 config and throw when missing", async () => {
    const runMutation = buildMutationMocks();
    const runAction = buildActionMocks();
    const runQuery = buildQueryMocks();
    const ctx = makeCtx(runMutation, runQuery, runAction);

    const files = new FilesControl(component, { r2: r2Config });

    await files.generateUploadUrl(ctx, { provider: "r2" });
    expect(runMutation).toHaveBeenCalledWith(
      component.upload.generateUploadUrl,
      { provider: "r2", r2Config },
    );

    await files.generateUploadUrl(ctx, {});
    expect(runMutation).toHaveBeenCalledWith(
      component.upload.generateUploadUrl,
      { provider: "convex", r2Config: undefined },
    );

    await files.consumeDownloadGrantForUrl(ctx, {
      downloadToken: "grant",
      r2Config: { ...r2Config, bucketName: "override" },
    });
    expect(runMutation).toHaveBeenCalledWith(
      component.download.consumeDownloadGrantForUrl,
      {
        downloadToken: "grant",
        r2Config: { ...r2Config, bucketName: "override" },
      },
    );

    await files.consumeDownloadGrantForUrl(ctx, {
      downloadToken: "grant",
    });
    expect(runMutation).toHaveBeenCalledWith(
      component.download.consumeDownloadGrantForUrl,
      {
        downloadToken: "grant",
        r2Config,
      },
    );

    await files.deleteFile(ctx, { storageId: "storage" });
    await files.deleteFile(ctx, { storageId: "storage", r2Config });
    await files.cleanupExpired(ctx, { limit: 5 });
    await files.cleanupExpired(ctx, {});

    await files.computeR2Metadata(ctx, {
      storageId: "storage",
      r2Config,
    });
    expect(runAction).toHaveBeenCalledWith(
      component.upload.computeR2Metadata,
      { storageId: "storage", r2Config },
    );

    await files.transferFile(ctx, {
      storageId: "storage",
      targetProvider: "convex",
    });
    expect(runAction).toHaveBeenCalledWith(
      component.transfer.transferFile,
      {
        storageId: "storage",
        targetProvider: "convex",
        r2Config,
      },
    );

    await files.transferFile(ctx, {
      storageId: "storage",
      targetProvider: "convex",
      r2Config,
    });
    expect(runAction).toHaveBeenCalledWith(
      component.transfer.transferFile,
      {
        storageId: "storage",
        targetProvider: "convex",
        r2Config,
      },
    );

    const filesNoConfig = new FilesControl(component);
    await expect(
      filesNoConfig.generateUploadUrl(ctx, { provider: "r2" }),
    ).rejects.toThrow("R2 configuration is missing required fields");

    await expect(
      filesNoConfig.transferFile(ctx, {
        storageId: "storage",
        targetProvider: "r2",
      }),
    ).rejects.toThrow("R2 configuration is missing required fields");

    await filesNoConfig.consumeDownloadGrantForUrl(ctx, {
      downloadToken: "grant",
    });
    expect(runMutation).toHaveBeenCalledWith(
      component.download.consumeDownloadGrantForUrl,
      {
        downloadToken: "grant",
        r2Config: undefined,
      },
    );

    const envKeys = [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
    ] as const;
    const savedEnv = Object.fromEntries(
      envKeys.map((key) => [key, process.env[key]]),
    );
    for (const key of envKeys) {
      delete process.env[key];
    }

    await expect(
      filesNoConfig.generateUploadUrl(ctx, { provider: "r2" }),
    ).rejects.toThrow(
      "R2 configuration is missing required fields for R2 uploads. Missing: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME",
    );

    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }

    expect(() => (filesNoConfig as any).requireR2Config()).toThrow(
      "R2 configuration is missing required fields",
    );

    const entriesSpy = vi.spyOn(Object, "entries").mockReturnValue([]);
    expect(() => (filesNoConfig as any).requireR2Config()).toThrow(
      "R2 configuration is missing required fields.",
    );
    entriesSpy.mockRestore();
  });

  test("FilesControl uses partial r2 config inputs", async () => {
    const runMutation = buildMutationMocks();
    const runAction = buildActionMocks();
    const runQuery = buildQueryMocks();
    const ctx = makeCtx(runMutation, runQuery, runAction);

    const filesPartial = new FilesControl(component, {
      r2: { accountId: "acct" },
    });

    await expect(
      filesPartial.generateUploadUrl(ctx, { provider: "r2" }),
    ).rejects.toThrow(
      "R2 configuration is missing required fields for R2 uploads. Missing: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME",
    );
  });

  test("FilesControl handles missing process global", async () => {
    const runMutation = buildMutationMocks();
    const runAction = buildActionMocks();
    const runQuery = buildQueryMocks();
    const ctx = makeCtx(runMutation, runQuery, runAction);

    const filesNoConfig = new FilesControl(component);
    vi.stubGlobal("process", undefined as any);

    await expect(
      filesNoConfig.generateUploadUrl(ctx, { provider: "r2" }),
    ).rejects.toThrow("R2 configuration is missing required fields for R2 uploads");
  });

  test("clientApi handlers invoke hooks", async () => {
    const runMutation = buildMutationMocks();
    const runQuery = buildQueryMocks();
    const runAction = buildActionMocks();
    const ctx = makeCtx(runMutation, runQuery, runAction);

    const hooks = {
      checkUpload: vi.fn(async () => undefined),
      checkFileMutation: vi.fn(async () => undefined),
      checkAccessKeyMutation: vi.fn(async () => undefined),
      checkDownloadConsume: vi.fn(async () => undefined),
      checkMaintenance: vi.fn(async () => undefined),
      checkReadFile: vi.fn(async () => undefined),
      checkReadVirtualPath: vi.fn(async () => undefined),
      checkReadAccessKey: vi.fn(async () => undefined),
      checkListFiles: vi.fn(async () => undefined),
      checkListDownloadGrants: vi.fn(async () => undefined),
      onUpload: vi.fn(async () => undefined),
      onDelete: vi.fn(async () => undefined),
      onAccessKeyAdded: vi.fn(async () => undefined),
      onAccessKeyRemoved: vi.fn(async () => undefined),
      onDownloadGrantCreated: vi.fn(async () => undefined),
      onDownloadConsumed: vi.fn(async () => undefined),
      onExpirationUpdated: vi.fn(async () => undefined),
    };

    const files = new FilesControl(component, { r2: r2Config });
    const api = files.clientApi(hooks);

    await getHandler(api.generateUploadUrl)(ctx, { provider: "r2" });
    await getHandler(api.finalizeUpload)(ctx, {
      uploadToken: "upload-token",
      storageId: "storage",
      accessKeys: ["a"],
      expiresAt: null,
      metadata: { size: 1, sha256: "hash", contentType: null },
    });
    await getHandler(api.registerFile)(ctx, {
      storageId: "storage",
      storageProvider: "convex",
      accessKeys: ["a"],
      metadata: { size: 1, sha256: "hash", contentType: null },
    });
    await getHandler(api.createDownloadGrant)(ctx, {
      storageId: "storage",
      maxUses: null,
      expiresAt: null,
    });
    await getHandler(api.consumeDownloadGrantForUrl)(ctx, {
      downloadToken: "grant-token",
      accessKey: "key",
    });
    await getHandler(api.addAccessKey)(ctx, {
      storageId: "storage",
      accessKey: "key",
    });
    await getHandler(api.removeAccessKey)(ctx, {
      storageId: "storage",
      accessKey: "key",
    });
    await getHandler(api.updateFileExpiration)(ctx, {
      storageId: "storage",
      expiresAt: null,
    });
    await getHandler(api.deleteFile)(ctx, { storageId: "storage" });
    await getHandler(api.cleanupExpired)(ctx, { limit: 1 });
    await getHandler(api.getFile)(ctx, { storageId: "storage" });
    await getHandler(api.getFileByVirtualPath)(ctx, {
      virtualPath: "/path/file.txt",
    });
    await getHandler(api.listFilesPage)(ctx, {
      paginationOpts: { numItems: 1, cursor: null },
    });
    await getHandler(api.listFilesByAccessKeyPage)(ctx, {
      accessKey: "key",
      paginationOpts: { numItems: 1, cursor: null },
    });
    await getHandler(api.listAccessKeysPage)(ctx, {
      storageId: "storage",
      paginationOpts: { numItems: 1, cursor: null },
    });
    await getHandler(api.listDownloadGrantsPage)(ctx, {
      paginationOpts: { numItems: 1, cursor: null },
    });
    await getHandler(api.hasAccessKey)(ctx, {
      storageId: "storage",
      accessKey: "key",
    });

    expect(hooks.checkUpload).toHaveBeenCalled();
    expect(hooks.checkFileMutation).toHaveBeenCalled();
    expect(hooks.checkAccessKeyMutation).toHaveBeenCalled();
    expect(hooks.checkDownloadConsume).toHaveBeenCalled();
    expect(hooks.checkMaintenance).toHaveBeenCalled();
    expect(hooks.checkReadFile).toHaveBeenCalled();
    expect(hooks.checkReadVirtualPath).toHaveBeenCalled();
    expect(hooks.checkReadAccessKey).toHaveBeenCalled();
    expect(hooks.checkListFiles).toHaveBeenCalled();
    expect(hooks.checkListDownloadGrants).toHaveBeenCalled();
    expect(hooks.onUpload).toHaveBeenCalled();
    expect(hooks.onDelete).toHaveBeenCalled();
    expect(hooks.onAccessKeyAdded).toHaveBeenCalled();
    expect(hooks.onAccessKeyRemoved).toHaveBeenCalled();
    expect(hooks.onDownloadGrantCreated).toHaveBeenCalled();
    expect(hooks.onDownloadConsumed).toHaveBeenCalled();
    expect(hooks.onExpirationUpdated).toHaveBeenCalled();
  });

  test("clientApi handlers run without hooks and handle nulls", async () => {
    const runMutation = buildMutationMocks({ deleteFile: { deleted: false } });
    const runQuery = buildQueryMocks({ returnNullFile: true });
    const runAction = buildActionMocks();
    const ctx = makeCtx(runMutation, runQuery, runAction);

    const files = new FilesControl(component, { r2: r2Config });
    const api = files.clientApi();

    await getHandler(api.generateUploadUrl)(ctx, { provider: "convex" });
    await getHandler(api.finalizeUpload)(ctx, {
      uploadToken: "upload-token",
      storageId: "storage",
      accessKeys: ["a"],
      expiresAt: null,
    });
    await getHandler(api.registerFile)(ctx, {
      storageId: "storage",
      storageProvider: "convex",
      accessKeys: ["a"],
    });
    await getHandler(api.createDownloadGrant)(ctx, { storageId: "storage" });
    await getHandler(api.consumeDownloadGrantForUrl)(ctx, {
      downloadToken: "grant-token",
    });
    await getHandler(api.addAccessKey)(ctx, {
      storageId: "storage",
      accessKey: "key",
    });
    await getHandler(api.removeAccessKey)(ctx, {
      storageId: "storage",
      accessKey: "key",
    });
    await getHandler(api.updateFileExpiration)(ctx, {
      storageId: "storage",
      expiresAt: 123,
    });
    await getHandler(api.deleteFile)(ctx, { storageId: "storage" });
    await getHandler(api.cleanupExpired)(ctx, {});
    const missingFile = await getHandler(api.getFile)(ctx, {
      storageId: "storage",
    });
    expect(missingFile).toBeNull();
    const missingVirtual = await getHandler(api.getFileByVirtualPath)(ctx, {
      virtualPath: "/path/file.txt",
    });
    expect(missingVirtual).toBeNull();
    await getHandler(api.listFilesPage)(ctx, {
      paginationOpts: { numItems: 1, cursor: null },
    });
    await getHandler(api.listFilesByAccessKeyPage)(ctx, {
      accessKey: "key",
      paginationOpts: { numItems: 1, cursor: null },
    });
    await getHandler(api.listAccessKeysPage)(ctx, {
      storageId: "storage",
      paginationOpts: { numItems: 1, cursor: null },
    });
    await getHandler(api.listDownloadGrantsPage)(ctx, {
      paginationOpts: { numItems: 1, cursor: null },
    });
    await getHandler(api.hasAccessKey)(ctx, {
      storageId: "storage",
      accessKey: "key",
    });
  });
});
