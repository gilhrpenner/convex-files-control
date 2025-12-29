import { describe, expect, test } from "vitest";

describe("entrypoint modules", () => {
  test("shared entrypoint and schema load from source", async () => {
    const shared = await import(new URL("../shared.ts", import.meta.url).href);
    expect(shared.DEFAULT_PATH_PREFIX).toBe("/files");

    const schemaModule = await import(
      new URL("../component/schema.ts", import.meta.url).href
    );
    expect(schemaModule.default).toBeTruthy();
  });
});
