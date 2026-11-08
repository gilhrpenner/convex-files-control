# Developing Convex Files Control

Use Node 24 (`nvm use`); CI also checks Node 22.12+. The library and example
have separate lockfiles. From the repository root:

```sh
npm ci
npm --prefix example ci
npm run check
```

`check` builds the package, typechecks and lints the library and example, runs
the unit/integration suite, verifies ESM exports, and builds the demo. For an
offline build without a configured backend, set
`VITE_CONVEX_URL=https://ci-placeholder.convex.cloud` (a build-only
placeholder). Do not use that URL for an interactive demo.

For coverage and a publish-content inspection:

```sh
npm run test:coverage
npm pack --dry-run
npm audit
npm --prefix example audit
```

See [example/README.md](example/README.md) for backend/auth setup and local
usage, and [example/DEPLOY.md](example/DEPLOY.md) for deployment. Run all Convex
CLI commands from the repository root; `convex.json` points to `example/convex`.

`npm run dev` watches the library, Convex backend, and Vite frontend.
`npm run build:codegen` regenerates component bindings and builds the library;
it requires Convex access. Normal builds and CI use committed generated bindings
and do not need cloud credentials.

Dependency updates are grouped by Dependabot. Both lockfiles and the example
checks must pass together. Renovate is disabled to avoid competing update PRs.

Both projects use TypeScript 7 for `tsc` builds and typechecks. The
`@typescript/native` dependency aliases `typescript@7`, while `typescript`
aliases `@typescript/typescript6` to provide the compiler API required by
typescript-eslint and other programmatic tooling. This follows Microsoft's
[side-by-side migration guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0).
Keep these aliases together when updating; replacing the API alias with a
direct TypeScript 7 dependency breaks linting. Vitest and its coverage provider
must also use matching versions, and ESLint/config upgrades must be validated
together. Dependabot groups these coupled packages, including major updates.

Package releases use
[GitHub Actions with npm trusted publishing](PUBLISHING.md). Prepare the version
and changelog in a PR, then dispatch the Release workflow after merging. No npm
publishing token or local release credentials are needed.
