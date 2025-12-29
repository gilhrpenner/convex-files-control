import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { registerRoutes } from "@gilhrpenner/convex-files-control";
import { components } from "./_generated/api";
import { getR2ConfigFromEnv } from "./r2Config";

const http = httpRouter();

auth.addHttpRoutes(http);

// Register HTTP routes for the file control component
registerRoutes(http, components.convexFilesControl, {
  pathPrefix: "files",
  requireAccessKey: true,
  enableUploadRoute: true,
  r2: getR2ConfigFromEnv() ?? undefined,
});

export default http;
