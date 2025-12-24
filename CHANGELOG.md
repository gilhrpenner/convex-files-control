# Changelog

## 0.1.0 (2025-12-26)

- Support secure uploads via pre-signed URLs (3-step client flow) or direct HTTP action uploads.
- Enforce access keys for download authorization, with optional per-file expiration timestamps.
- Generate temporary, proxied download links with max-uses, TTL, and filename overrides.
- Expose file metadata (size, SHA-256, MIME type) and provide guidance for app-level persistence.
- Include grant monitoring plus cleanup hooks for expired or exhausted download grants.
- Provide file management, access control, and query primitives (delete/update, add/remove/list keys, list/get files).

## 0.0.0

- Initial release.
