export const DEFAULT_PATH_PREFIX = "/files";

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export function normalizePathPrefix(pathPrefix: string): string {
  const trimmed = pathPrefix.trim();
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.replace(/\/$/, "");
}

export function buildEndpointUrl(
  baseUrl: string,
  pathPrefix: string,
  endpoint: string,
): string {
  const base = normalizeBaseUrl(baseUrl);
  const prefix = normalizePathPrefix(pathPrefix);
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  return `${base}${prefix}/${cleanEndpoint}`;
}
