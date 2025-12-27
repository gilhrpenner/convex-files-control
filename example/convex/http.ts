import { httpRouter } from "convex/server";
import { registerRoutes } from "@gilhrpenner/convex-files-control";
import { components } from "./_generated/api";

const http = httpRouter();

// Register HTTP routes for the component
registerRoutes(http, components.convexFilesControl, {
  pathPrefix: "files",
  requireAccessKey: true,
  accessKeyQueryParam: "testAccessKey",
  enableUploadRoute: true,
});

// You can also register routes at different paths
// convexFilesControl.registerRoutes(http, {
//   path: "/api/files",
// });

export default http;
