import { describe, expect, test } from "vitest";
import { initConvexTest } from "./setup.test";
import { api } from "./_generated/api";

describe("example", () => {
  test("listComponentFiles returns an empty array by default", async () => {
    const t = initConvexTest();
    const files = await t.query(api.example.listComponentFiles, {});
    expect(files).toEqual([]);
  });

  test("listCustomFiles returns an empty array by default", async () => {
    const t = initConvexTest();
    const files = await t.query(api.example.listCustomFiles, {});
    expect(files).toEqual([]);
  });
});
