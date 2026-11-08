import { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      // Auth config is evaluated separately; this is a built-in Convex variable.
      // eslint-disable-next-line @convex-dev/no-process-env
      domain: process.env.CONVEX_SITE_URL!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
