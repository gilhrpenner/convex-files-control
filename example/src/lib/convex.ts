import { resolveDeployment } from "./deployment";

export const { convexUrl, convexSiteUrl } = resolveDeployment(
  import.meta.env.VITE_CONVEX_URL,
  import.meta.env.VITE_CONVEX_SITE_URL,
);
