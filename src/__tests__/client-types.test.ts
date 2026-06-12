import { test } from "vitest";
import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import { FilesControl } from "../client/index.js";

function assertFilesControlServerCtxTypes(
  actionCtx: GenericActionCtx<GenericDataModel>,
  mutationCtx: GenericMutationCtx<GenericDataModel>,
  queryCtx: GenericQueryCtx<GenericDataModel>,
) {
  const files = new FilesControl({} as never);

  void files.finalizeUpload(actionCtx, {} as never);
  void files.finalizeUpload(mutationCtx, {} as never);

  void files.getFile(actionCtx, { storageId: "storage-id" });
  void files.getFile(mutationCtx, { storageId: "storage-id" });
  void files.getFile(queryCtx, { storageId: "storage-id" });
}

test("FilesControl helper methods accept server contexts", () => {
  void assertFilesControlServerCtxTypes;
});
