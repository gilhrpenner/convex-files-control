import { httpRouter } from "convex/server";
import { registerRoutes } from "@gilhrpenner/convex-files-control";
import { components } from "./_generated/api";
import { getR2ConfigFromEnv } from "./r2Config";

const http = httpRouter();

// Register HTTP routes for the component
registerRoutes(http, components.convexFilesControl, {
  pathPrefix: "files",
  requireAccessKey: true,
  accessKeyQueryParam: "testAccessKey",
  enableUploadRoute: true,
  r2: getR2ConfigFromEnv() ?? undefined,
});

// You can also register routes at different paths
// convexFilesControl.registerRoutes(http, {
//   path: "/api/files",
// });

export default http;
