import { defineApp } from "convex/server";
import convexFilesControl from "@gilhrpenner/convex-files-control/convex.config.js";

const app = defineApp();
app.use(convexFilesControl);

export default app;
