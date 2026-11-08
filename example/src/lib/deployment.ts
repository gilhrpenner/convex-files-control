export function resolveDeployment(url?: string, siteUrl?: string) {
  if (!url?.trim()) {
    throw new Error(
      "VITE_CONVEX_URL is required. Run npx convex dev from the repository root.",
    );
  }
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("VITE_CONVEX_URL must be an HTTP(S) URL.");
  }
  // The CLI overrides the RPC URL during deploy. Derive its matching HTTP URL
  // instead of accidentally retaining a development .site URL from .env.local.
  const httpUrl = parsed.hostname.endsWith(".convex.cloud")
    ? `${parsed.protocol}//${parsed.hostname.replace(/\.convex\.cloud$/, ".convex.site")}`
    : siteUrl?.trim();
  if (!httpUrl) {
    throw new Error(
      "VITE_CONVEX_SITE_URL is required for local or custom Convex deployments.",
    );
  }
  const site = new URL(httpUrl);
  if (!["http:", "https:"].includes(site.protocol)) {
    throw new Error("VITE_CONVEX_SITE_URL must be an HTTP(S) URL.");
  }
  return { convexUrl: parsed.origin, convexSiteUrl: site.origin };
}
