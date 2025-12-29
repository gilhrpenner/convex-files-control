import { describe, expect, test } from "vitest";
import { corsHeaders, parseJsonStringArray } from "../client/http.js";

describe("http helpers", () => {
  test("corsHeaders sets credentials for specific origins", () => {
    const headers = corsHeaders("https://example.com");
    expect(headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
    expect(headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  test("corsHeaders includes extra allow headers", () => {
    const headers = corsHeaders(undefined, ["X-Extra"]);
    expect(headers.get("Access-Control-Allow-Headers")).toContain("X-Extra");
  });

  test("corsHeaders trims and deduplicates allow headers", () => {
    const headers = corsHeaders(undefined, ["", " Authorization ", "authorization"]);
    const allow = headers.get("Access-Control-Allow-Headers") ?? "";
    const matches = allow.split(", ").filter((value) => value === "Authorization");
    expect(matches).toHaveLength(1);
  });

  test("parseJsonStringArray returns string arrays", () => {
    expect(parseJsonStringArray('["a","b"]')).toEqual(["a", "b"]);
  });

  test("parseJsonStringArray rejects non-string arrays", () => {
    expect(parseJsonStringArray('["a", 1]')).toBeNull();
  });

  test("parseJsonStringArray returns null for invalid JSON", () => {
    expect(parseJsonStringArray("not-json")).toBeNull();
  });
});
