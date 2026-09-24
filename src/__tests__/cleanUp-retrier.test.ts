import { afterEach, expect, test, vi } from "vitest";
import { components, initConvexTest } from "../client/setup.test.js";
import * as r2 from "../component/r2.js";

const api = components.convexFilesControl;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("deletion commits before storage cleanup and retries a failed action", async () => {
  vi.useFakeTimers();
  const t = initConvexTest();
  const r2Config = {
    accountId: "account",
    accessKeyId: "access",
    secretAccessKey: "secret",
    bucketName: "bucket",
  };
  const remove = vi
    .spyOn(r2, "deleteR2Object")
    .mockRejectedValueOnce(new Error("Storage unavailable"))
    .mockResolvedValue(undefined);
  const storageId = "retry-cleanup";
  await t.mutation(api.upload.registerFile, {
    storageId,
    storageProvider: "r2",
    accessKeys: ["owner"],
  });

  expect(
    await t.mutation(api.cleanUp.deleteFile, { storageId, r2Config }),
  ).toEqual({ deleted: true });
  expect(remove).not.toHaveBeenCalled();
  expect(await t.query(api.queries.getFile, { storageId })).toBeNull();

  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(remove).toHaveBeenCalledTimes(2);
  expect(remove).toHaveBeenLastCalledWith(r2Config, storageId);
  expect(await t.query(api.queries.getFile, { storageId })).toBeNull();
});
