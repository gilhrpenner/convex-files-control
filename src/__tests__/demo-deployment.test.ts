import { describe, expect, it } from "vitest";
import { resolveDeployment } from "../../example/src/lib/deployment.js";

describe("demo deployment configuration", () => {
  it("never falls back to the public demo", () => {
    expect(() => resolveDeployment()).toThrow("VITE_CONVEX_URL is required");
  });
  it("pairs the production RPC and HTTP origins despite a stale local site URL", () => {
    expect(
      resolveDeployment(
        "https://production.convex.cloud/",
        "https://development.convex.site",
      ),
    ).toEqual({
      convexUrl: "https://production.convex.cloud",
      convexSiteUrl: "https://production.convex.site",
    });
  });
  it("supports explicit local HTTP action origins", () => {
    expect(
      resolveDeployment("http://127.0.0.1:3210", "http://127.0.0.1:3211/"),
    ).toEqual({
      convexUrl: "http://127.0.0.1:3210",
      convexSiteUrl: "http://127.0.0.1:3211",
    });
  });
  it("requires an HTTP action URL for a custom deployment", () => {
    expect(() => resolveDeployment("https://convex.example.com")).toThrow(
      "VITE_CONVEX_SITE_URL",
    );
  });
  it("rejects malformed and non-HTTP origins", () => {
    expect(() => resolveDeployment("not a URL")).toThrow();
    expect(() => resolveDeployment("javascript:alert(1)")).toThrow("HTTP(S)");
    expect(() =>
      resolveDeployment("https://example.com", "file:///tmp"),
    ).toThrow("HTTP(S)");
  });
});
