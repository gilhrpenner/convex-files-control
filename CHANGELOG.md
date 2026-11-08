# Changelog

## 0.6.0 (2026-11-08)

### Compatibility

- Requires Convex **1.46.0 or newer** and Node **22.12.0 or newer** (Node 24
  recommended). The Convex minimum follows the updated convex-helpers peer
  requirement. React 18.3.1 and React 19 remain supported.
- Upgrade Convex alongside this package and regenerate your app's bindings
  before deploying. No component schema/data migration is required.

### Fixes

- Preserve `virtualPath` in React HTTP uploads; the server's
  `checkUploadRequest` hook remains responsible for validating and accepting it.
- Repair the example's Convex Auth/Auth.js peer conflict and remove its fallback
  to the public demo backend.
- Enforce the example's 5MB HTTP upload limit and reject invalid/past expiration
  timestamps before storing a file. Keep component and example expiration in
  sync so cleanup deletes the stored object as well as the demo record.
- Restore upload notifications, preserve share-link filenames, and refresh
  expiration controls as time passes.
- Pair frontend RPC and HTTP-action deployment URLs during production builds.

### Dependencies and tooling

- Update development Convex to 1.49.0, convex-helpers to 0.1.134, action-retrier
  to 0.3.1, convex-test to 0.0.67, and example Convex Auth to 0.0.96.
- Refresh AWS SDK, React, Vite, router, Zod, and both dependency lockfiles;
  remove the vulnerable `ws` override and unused tooling.
- Address all 59 Dependabot alerts open at the modernization audit. Both
  production dependency audits are clean. A moderate development-only minimatch
  advisory remains in the ESLint dependency chain; see the evidence report.
- Validate both library and example in CI on Node 22 and 24, retain validation
  artifacts, and group maintenance updates through Dependabot.
- Exclude tests from the published package; retain the `./test` integration
  export.
- Refresh contributor and demo deployment documentation, add internal demo-user
  seeding, and remove obsolete setup scaffolding.

### Validation

- 161 tests pass; library coverage is 98.38% statements, 98.75% branches, 100%
  functions, and 98.36% lines.
- Verify package exports with Convex 1.46.0/React 18.3.1, actual development
  backend push/codegen, and browser upload/download/sharing flows.
- See [the validation report](docs/evidence/modernization/README.md) for logs,
  screenshots, a browser recording, and remaining deployment limitations.

## 0.5.9 (2026-09-23)

### Fixes

- Use the cleanup action retrier in tests and production. Storage failures retry
  after file registration deletion commits.
- Preload component test modules before Convex queries and mutations restrict
  global timers.

### Tests

- Verify cleanup scheduling and retry behavior with Convex Test 0.0.59.

## 0.5.8 (2026-08-25)

### Features

- **http**: Add an optional exact CORS policy for HTTP upload and download
  routes. Applications can allow specific browser origins and request headers,
  control credential support, and reject other browser origins with `403`.
  Routes keep the existing permissive behavior when the policy is omitted.

### Tests

- **http**: Cover allowed and rejected origins, exact allowed-header lists, and
  credential response headers.

---

## 0.5.7 (2026-08-02)

### Features

- **cleanup**: Allow callers with host-owned blob lifecycles to pass
  `deleteStorage: false` when deleting a file, removing the component's file
  registration, access rows, and download grants while retaining the underlying
  Convex or R2 storage object. Thanks @seanaguinaga for the contribution.

### Tests

- **cleanup**: Cover retained Convex and R2 storage while verifying related
  component records are removed.

### Chores

- **deps**: Refresh `js-yaml`, `postcss`, and the example app's `@auth/core`
  dependency through Dependabot updates.

---

## 0.5.6 (2026-06-12)

### Fixes

- **types**: Accept Convex action contexts in `FilesControl` query and mutation
  helpers with Convex 1.41.0 by typing helper contexts against the shared action
  `runQuery`/`runMutation` signatures.
- **tests**: Add server context type coverage and bump the Convex dev dependency
  to 1.41.0 so local checks exercise the updated Convex ctx signatures.

### Chores

- **deps**: Refresh the Vite dev dependency tree to pick up the latest
  `shell-quote` security fix.

---

## 0.5.5 (2026-06-02)

### Chores

- Bump Convex to 1.40.0 and align example dependencies so local dev typechecks
  against the same Convex and React versions.

---

## 0.5.4 (2026-05-22)

### Chores

- Refresh package dependencies, including AWS SDK S3 packages, Convex helpers,
  React dev dependencies, Vitest, Prettier, and package publishing tooling.
- Apply dependency security updates for Vite and transitive packages reported by
  Dependabot, with a temporary `ws` override while Convex still pins the
  vulnerable release.

---

## 0.5.3 (2026-04-28)

### Features

- **r2**: Add optional R2 jurisdiction support via `jurisdiction` or
  `R2_JURISDICTION`, enabling jurisdictional bucket endpoints such as EU R2
  buckets. Thanks @FleetAdmiralJakob for the report and initial patch.

---

## 0.5.2 (2026-03-20)

### Fixes

- **esm**: Fix published ESM entrypoints and internal runtime modules to use
  explicit `.js` relative imports, including the shared hash export path used by
  streaming hash support, so the package loads correctly in strict ESM
  environments such as Node.js and Vitest.
- **build**: Enforce Node-style module resolution for the publish build and
  validate built `dist` entrypoints before release to prevent ESM packaging
  regressions.

---

## 0.5.1 (2026-01-02)

### Features

- **http**: `checkUploadRequest` hook now receives `formData` parameter,
  enabling access to custom form fields for authorization and path generation.

---

## 0.5.0 (2026-01-02)

### Breaking Changes

- **http!**: `virtualPath` is no longer accepted via form data in HTTP uploads.
  For security, `virtualPath` must now be returned from the `checkUploadRequest`
  hook. This prevents clients from specifying arbitrary file paths.
- **types!**: Removed `virtualPath` from `UploadRequestArgs` type.

### Features

- **http**: `checkUploadRequest` hook can now return `virtualPath` to set the
  file's storage path server-side.

---

## 0.4.0 (2025-12-31)

### Features

- **files**: Add optional `virtualPath` for globally unique, logical file paths,
  with indexing and a new `getFileByVirtualPath` query.
- **upload**: Allow specifying `virtualPath` during upload initialization and
  finalization, using it as the R2 object key when provided.
- **transfer**: Allow updating a file's virtual path without changing its
  storage provider; optimize Convex storage transfers to metadata-only updates
  and infer filenames for virtual paths ending in `/`.
- **access**: Add a `checkReadVirtualPath` hook for virtual path access control.

---

## 0.3.0 (2025-12-31)

### Breaking Changes

- **http!**: `onUploadComplete` now receives `formData` instead of `request`.

### Features

- **http**: Added `runQuery` to `RunHttpActionCtx` for HTTP hooks.

---

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
