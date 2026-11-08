# Modernization validation — 2026-11-08

Run from Node 24.16.0 / npm 11.13.0 against the PR branch. The base is
`54c6c047b4a085f0d03f7ff8841316a1d0f85bab`. CI repeats the checks on Node 22 and
24 and uploads logs, audit reports, and package manifests as run artifacts.

## Reproduce

```sh
npm ci
npm --prefix example ci
VITE_CONVEX_URL=https://ci-placeholder.convex.cloud npm run check
npm run test:coverage
npm pack --dry-run
npm audit --omit=dev
npm --prefix example audit --omit=dev
npm audit --audit-level=high
npm --prefix example audit --audit-level=high
```

The placeholder is for builds only. Interactive tests used the configured Convex
**development** deployment `proficient-vulture-369`, with freshly configured
auth and two seeded demo users. No public production deployment or npm publish
occurred.

## Automated evidence

- [Complete check log](check.txt): package and example build, both typechecks,
  both linters, 161 passing tests, and ESM export checks.
- [Coverage](coverage.txt): V8 coverage for the library (not browser UI
  coverage).
- [Consumer smoke](consumer-smoke.txt): packed client/React entrypoints load in
  a separate install with minimum supported Convex 1.46.0 and React 18.3.1.
- [Convex push](convex-dev-push.txt): actual backend compilation, codegen,
  component typecheck and push to a development deployment.
- [Failing regression before the fix](http-path-regression-before.txt): the HTTP
  upload hook omitted virtualPath. The same assertion passes in the final suite.
- [Package manifest](package.json): tarball file inventory; test files are
  excluded.

## Security evidence

[All 59 previously open Dependabot alerts](dependabot-resolution.json) are
mapped to the resolved package versions. None of these versions satisfies its
associated vulnerable range. GitHub closes alerts after the fix lands on the
default branch; this report does not claim they have already been closed.

Both [library](root-production-audit.json) and
[example](example-production-audit.json) production dependency audits report
zero vulnerabilities. Full audits retain 7 and 8 moderate findings respectively,
all from
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249):
`typescript-eslint → typescript-estree → minimatch@10.2.6`, plus the Convex
ESLint plugin in the example. The published patch is 11.0.1, outside the
upstream range. No unsupported cross-major override or advisory dismissal was
applied. Both CI jobs fail on high/critical findings; runtime dependency audits
fail on any severity.

The before/after full audit JSON files are included alongside this report. These
are dependency checks, not a claim of an exhaustive application security audit.

## Browser evidence

- [Desktop screenshot](desktop.png): successful presigned and HTTP uploads with
  distinct virtual paths and 24-hour expiration.
- [Mobile screenshot](mobile.png): 390px viewport; document width also measured
  390px (no page-wide horizontal overflow).
- [Browser recording](browser-smoke.mp4): sign-in, both upload methods,
  download, protected sharing, and the HTTP virtual-path recheck. It includes
  the discovery of the missing path before the fix and its successful recheck
  afterward.

Live checks performed against a production Vite build served locally:

- Alice sign-in and presigned upload; downloaded bytes matched the 47-byte
  input.
- HTTP upload, then corrected HTTP virtual path `/modernization/http-fixed.txt`.
- Protected link required a password; correct password downloaded matching
  bytes.
- Reusing the one-use link showed download unavailable.
- Bob's “Your Uploads” view was empty after switching identity and reloading.
- Deletion of the smoke fixtures; no pre-existing files were changed.
- No unexpected console errors during successful upload/download operations;
  password-required and exhausted-link responses deliberately returned errors.

## Limits and rollout

- Cloudflare access is currently to the Purple Law account, whose Pages project
  list does not contain `convex-files-control-example`. The existing demo's
  account must be selected/authenticated before republishing it. No replacement
  project was created.
- The old public demo used `intent-tiger-143`, a development backend in another
  project. Confirm the intended backend before running the production deploy
  script.
- R2 credentials are absent on the development deployment. R2 logic is covered
  by mocked integration tests; a real R2 upload/transfer round trip remains a
  rollout check for the owning account.
- Vite reports a 721kB minified main JS chunk (~218kB gzip). This is a size
  warning, not a failed build. Unrelated UI-library/TypeScript major migrations
  are deferred.
- Convex 1.46+ is now required by convex-helpers; Node 22.12+ is the tooling
  floor. React 18/19 support is retained. No package version was released in
  this PR.

See [deployment instructions](../../../example/DEPLOY.md) for the exact commands
and smoke checklist for the public demo.
