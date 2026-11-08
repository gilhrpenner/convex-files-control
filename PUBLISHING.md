# Publishing

Releases use
[GitHub Actions](https://github.com/gilhrpenner/convex-files-control/actions/workflows/release.yml)
and npm trusted publishing (OIDC). No `NPM_TOKEN`, local npm login, or Convex
credentials are required. The demo has a separate
[deployment procedure](example/DEPLOY.md).

## One-time setup

The main-branch protection rule requires CodeQL results. GitHub CodeQL default
setup is configured in repository Settings → Code security for
JavaScript/TypeScript and GitHub Actions. Let the initial setup scan finish and
require successful PR analysis before merging release changes. The scan is
managed by GitHub and does not require another workflow file or secret.

1. Merge `.github/workflows/release.yml` into `main`.
2. Create a GitHub environment named **`npm`** in repository Settings →
   Environments. Restrict deployment branches/tags to branch **`main`** and tags
   **`v*`**. Add required reviewers if you want an approval before npm
   publishing; leave reviewers unset for automatic releases after validation.
3. In the npm package's
   [settings](https://www.npmjs.com/package/@gilhrpenner/convex-files-control/access),
   add this trusted publisher:

   | Field                | Value                                      |
   | -------------------- | ------------------------------------------ |
   | Provider             | GitHub Actions                             |
   | Organization or user | `gilhrpenner`                              |
   | Repository           | `convex-files-control`                     |
   | Workflow filename    | `release.yml` (no directory prefix)        |
   | Environment          | `npm`                                      |
   | Allowed actions      | Allow direct publishing with `npm publish` |

   Dist-tag management permission is not needed: `npm publish --tag` sets the
   initial tag. Do not create a granular access token or GitHub npm secret.

4. Complete the first publish within **two days** of creating the npm trust
   configuration. npm expires configurations that have not published within that
   window; recreate the configuration if it expires.
5. After the first successful publish, npm recommends setting Publishing access
   to **Require two-factor authentication and disallow tokens**. Trusted
   publishing continues to work. Revoke unused publishing tokens.

The workflow uses GitHub-hosted runners, Node 24.16.0 and npm 12.2.2. npm
requires CLI 11.5.1+ and Node 22.14.0+ for trusted publishing. The npm job
requests `id-token: write`; all other jobs have no OIDC permission. npm
generates signed provenance for this public repository/package.

See npm's
[trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).

## Prepare a version

Choose a version and prepare its package metadata and changelog in a normal PR:

```sh
npm version 0.7.0 --no-git-tag-version --ignore-scripts
```

Add a nonempty `## 0.7.0 (YYYY-MM-DD)` section to `CHANGELOG.md`, then commit
`package.json`, `package-lock.json`, and the changelog. The workflow extracts
that section for GitHub release notes. Merge the PR after CI passes.

Stable versions publish to `latest`. Prereleases must use `alpha.N`, `beta.N`,
or `rc.N` (for example `0.7.0-beta.1`); they publish to the corresponding npm
tag and become GitHub prereleases. They never update `latest`.

## Run the release

In Actions → **Release** → **Run workflow**, select **main**:

1. Leave **dry_run** checked to validate and inspect the release artifact.
2. Uncheck **dry_run** to publish the version already committed on main.

Or use GitHub CLI:

```sh
 gh workflow run release.yml --ref main -f dry_run=true
 gh workflow run release.yml --ref main -f dry_run=false
```

`npm run release:check` and `npm run release` dispatch these same commands.
Neither changes your version nor publishes from your machine.

An intentional push of a `v*` tag also starts the workflow. The tag must match
the package version and point to a commit already on main.

The workflow:

1. Validates package identity, lockfile version, changelog, and source branch.
2. Installs both lockfiles without a cache, then runs release guard tests, the
   complete library/example checks, and production/high-severity audit gates.
3. Packs once, checks required exports and excluded files, and stores the
   tarball, SHA-512 integrity, SHA-256 checksum, package manifest, notes, and
   logs as a GitHub Actions artifact.
4. Creates an annotated version tag, or verifies an existing tag points to the
   exact same source commit. It never moves a tag.
5. Publishes that exact tarball using OIDC, with lifecycle scripts disabled and
   provenance enabled. The publish job does not install project dependencies.
6. Verifies npm's recorded integrity, then creates or publishes the GitHub
   release with notes, the package, checksum, manifest, and validation log.
   npm may process an accepted publish asynchronously. This step makes up to
   13 registry checks, waiting 15 seconds between missing-version responses.
   Registry errors and different package contents stop the release immediately.
   Existing curated draft notes are preserved.

Dry runs perform steps 1–3 and report tag conflicts. They create no tags, GitHub
releases, or npm versions and cannot prove OIDC authentication works. All
release runs are serialized. Only the tagging and GitHub release jobs receive
repository write access.

## Retries and existing tags

Use **Re-run failed jobs** on the original run. This retains the validated
artifact and the original commit. If npm already accepted those exact bytes, the
publish job skips publication and finishes the GitHub release. Registry outages
and authentication errors are not treated as missing versions.

If npm takes longer than the automatic wait to process the package, the GitHub
release stays unpublished. Wait until the version appears on npm, then re-run the
failed job; do not publish the package again.

If artifacts have expired, run the workflow against the exact version tag
instead of the newer main branch. A rebuilt tarball must have the same npm
integrity before an existing version can be reused. A published GitHub release
is left unchanged. Never delete an npm version or move a published tag to fix a
failed job; use a new version if the content differs.

## Local package inspection

Use Node 24, install both lockfiles, and run the same packaging checks:

```sh
npm ci
npm --prefix example ci
VITE_CONVEX_URL=https://ci-placeholder.convex.cloud npm run check
node --test scripts/release.test-node.mjs
node scripts/release.mjs prepare
node scripts/release.mjs pack
node scripts/release.mjs verify
```

These commands create ignored files under `release/` and do not publish or
modify Git tags. A local `npm publish` still runs the existing clean-build hook;
the supported release path is GitHub Actions.
