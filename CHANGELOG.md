# Changelog

## 0.2.0 (2025-12-29)

### Breaking Changes

- **auth!**: Enhanced upload and download authentication - auth tokens are now
  required for secure file operations.
- **react!**: Removed `accessKeys` from `useUploadFile` arguments - access keys
  are now handled internally.

### Features

- **ui**: Added admin, transfer, and access-control UI panels in the example
  app.
- **files**: Added file management API with file listing, metadata queries, and
  hourly cleanup cron job.
- **download**: Added shareable links with configurable max-uses, TTL,
  expiration, and password protection.
- **download**: Added download page for password-protected shareable links.
- **download**: Added single-use download grants and client-side download flow.
- **files**: Added file deletion for user uploads.
- **upload**: Persist and display original uploaded file name.
- **upload**: Record file uploads in database with user association.
- **upload**: Compute and include file metadata (size, SHA-256, MIME type) for
  uploads.
- **upload**: Added `onUploadComplete` hook for post-upload actions.
- **http**: Added authentication support to HTTP endpoints.

### Chores

- Replaced old example app with new modern UI example featuring Shadcn
  components.

---

## 0.1.1 (2025-12-28)

- Support secure uploads via pre-signed URLs (3-step client flow) or direct HTTP
  action uploads.
- Enforce access keys for download authorization, with optional per-file
  expiration timestamps.
- Generate temporary, proxied download links with max-uses, TTL, and filename
  overrides.
- Expose file metadata (size, SHA-256, MIME type) and provide guidance for
  app-level persistence.
- Include grant monitoring plus cleanup hooks for expired or exhausted download
  grants.
- Provide file management, access control, and query primitives (delete/update,
  add/remove/list keys, list/get files).
- Support Convex and R2 as storage providers
- Allow to set a password-protected download URL

## 0.0.0

- Initial release.
