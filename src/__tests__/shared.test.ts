import { describe, expect, test, vi } from "vitest";
import {
  buildEndpointUrl,
  normalizeBaseUrl,
  normalizePathPrefix,
} from "../shared/urls.js";
import { r2EndpointFromAccountId } from "../shared/r2.js";
import { isStorageProvider } from "../shared/types.js";
import testHelpers, { register } from "../test.js";
import * as shared from "../shared.js";
import schema from "../component/schema.js";
import actionRetrier from "@convex-dev/action-retrier/test";
import { __ignore } from "../client/_generated/_ignore.js";

describe("shared urls", () => {
  test("normalizes base and path prefixes", () => {
    expect(normalizeBaseUrl("https://example.com/")).toBe("https://example.com");
    expect(normalizeBaseUrl("https://example.com")).toBe("https://example.com");

    expect(normalizePathPrefix(" files/ ")).toBe("/files");
    expect(normalizePathPrefix("/custom/")).toBe("/custom");
  });

  test("buildEndpointUrl handles prefixes and endpoint slashes", () => {
    expect(buildEndpointUrl("https://example.com/", "files", "upload")).toBe(
      "https://example.com/files/upload",
    );
    expect(buildEndpointUrl("https://example.com", "/files/", "/download")).toBe(
      "https://example.com/files/download",
    );
  });
});

describe("shared helpers", () => {
  test("r2EndpointFromAccountId builds cloudflare endpoint", () => {
    expect(r2EndpointFromAccountId("abc123")).toBe(
      "https://abc123.r2.cloudflarestorage.com",
    );
  });

  test("isStorageProvider validates providers", () => {
    expect(isStorageProvider("convex")).toBe(true);
    expect(isStorageProvider("r2")).toBe(true);
    expect(isStorageProvider("other")).toBe(false);
  });
});

describe("test helpers", () => {
  test("register wires component and action retrier", () => {
    const registerComponent = vi.fn();
    const t = { registerComponent } as any;

    const retrierSpy = vi.spyOn(actionRetrier, "register");
    register(t, "customComponent");

    expect(registerComponent).toHaveBeenCalledTimes(2);
    expect(registerComponent.mock.calls[0]?.[0]).toBe("customComponent");
    expect(registerComponent.mock.calls[0]?.[1]).toBe(schema);
    expect(registerComponent.mock.calls[1]?.[0]).toBe("actionRetrier");
    expect(retrierSpy).toHaveBeenCalledWith(t);
  });

  test("default export exposes helpers", () => {
    expect(testHelpers.register).toBe(register);
    expect(testHelpers.schema).toBe(schema);
    expect(testHelpers.modules).toBeTypeOf("object");
  });

  test("shared exports are available", () => {
    expect(shared.DEFAULT_PATH_PREFIX).toBe("/files");
    expect(__ignore).toBe(true);
  });

});
