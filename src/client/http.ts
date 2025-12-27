export function corsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
}

export function corsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function jsonSuccess(data: unknown): Response {
  const headers = corsHeaders();
  headers.set("Content-Type", "application/json");

  return new Response(JSON.stringify(data), { status: 200, headers });
}

export function jsonError(message: string, status: number): Response {
  const headers = corsHeaders();
  headers.set("Content-Type", "application/json");

  return new Response(JSON.stringify({ error: message }), { status, headers });
}

export function parseJsonStringArray(value: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(value);

    if (
      Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
    ) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

export function parseOptionalTimestamp(
  value: FormDataEntryValue | null,
): number | null | undefined | "invalid" {
  if (value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    return "invalid";
  }

  const trimmed = value.trim();

  if (trimmed === "" || trimmed === "null") {
    return null;
  }

  const num = Number(trimmed);
  return Number.isNaN(num) ? "invalid" : num;
}

export function sanitizeFilename(value: string | null): string {
  if (!value) {
    return "download";
  }

  const clean = value.trim().replace(/[^A-Za-z0-9._-]/g, "_");
  return clean || "download";
}

export function statusCodeForDownloadError(
  status:
    | "expired"
    | "exhausted"
    | "file_expired"
    | "access_denied"
    | "password_required"
    | "invalid_password"
    | string,
): number {
  switch (status) {
    case "expired":
    case "exhausted":
    case "file_expired":
      return 410;
    case "password_required":
      return 401;
    case "access_denied":
    case "invalid_password":
      return 403;
    default:
      return 404;
  }
}
