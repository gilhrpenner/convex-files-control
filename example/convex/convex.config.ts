import { v } from "convex/values";
import { defineApp } from "convex/server";
import convexFilesControl from "@gilhrpenner/convex-files-control/convex.config";

const app = defineApp({
  env: {
    R2_ACCOUNT_ID: v.optional(v.string()),
    R2_ACCESS_KEY_ID: v.optional(v.string()),
    R2_SECRET_ACCESS_KEY: v.optional(v.string()),
    R2_BUCKET_NAME: v.optional(v.string()),
    R2_JURISDICTION: v.optional(v.string()),
  },
});
app.use(convexFilesControl);

export default app;
