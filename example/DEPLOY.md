# Deploy the shared demo

Run all commands from the repository root. The public frontend is
https://convex-files-control-example.pages.dev. Publishing this frontend does not
publish the npm library; it bundles the local `file:..` package.

## Check the destination first

```sh
npm ci
npm --prefix example ci
npm run check
npm --prefix example exec -- wrangler whoami
npm --prefix example exec -- wrangler pages project list
npx convex env list --prod --names-only
```

The Cloudflare account must own `convex-files-control-example`. If it is absent,
sign into its owning account; do not create a similarly named replacement.
Confirm the intended Convex project/deployment in the CLI output. The old demo
used the **development** backend `intent-tiger-143`; a different root `.env.local`
may select another project. Do not assume `convex deploy` targets that old backend:
it targets the selected project's default **production** deployment.

Before a first production deployment, configure Convex Auth for that deployment
(`SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS`) and optional R2 credentials. Configure auth
using the installed CLI with `--prod --web-server-url` and the frontend URL.
Do not rotate existing auth keys just to redeploy. Seed a fresh deployment after
its functions are deployed with `npx convex run --prod seed:demoUsers`.

## Coordinated production publish

```sh
npm run demo:deploy
```

This builds the local library, runs `convex deploy` with the frontend build as
`--cmd`, then publishes `example/dist` to the Pages production branch `main`.
Convex supplies `VITE_CONVEX_URL` to the build; HTTP actions use the matching
`.convex.site` origin, even if root `.env.local` contains a development site URL.
Wrangler runtime `vars` cannot configure a Vite bundle that has already been built.
The Convex CLI displays the backend destination before deployment.

For Pages Git integration, use the repository root, output `example/dist`, and
build command `npm ci && npm --prefix example ci && npm run demo:build`.
Configure a deployment-specific `CONVEX_DEPLOY_KEY` as a secret and Node 24 in the
hosting environment. Restrict production keys to trusted production builds.

## Frontend preview against an already deployed backend

```sh
VITE_CONVEX_URL=https://YOUR-DEPLOYMENT.convex.cloud npm run build:example
npm --prefix example exec -- wrangler pages deploy example/dist --project-name=convex-files-control-example --branch=modernization-preview
```

This only updates the frontend. Deploy the corresponding backend to a development
or preview deployment first; it must support the same API as the frontend.

## Smoke checks

- Select Alice; upload a small text file by presigned URL and HTTP Action.
- Confirm name, size, virtual path, provider, and expiration in the file table.
- Download and compare contents with the original.
- Generate a share link; check correct/incorrect passwords and exhausted links.
- Switch to Bob and confirm Alice's uploads are absent from “Your Uploads”.
- Return to Alice and delete only the files created for this smoke test.
- Check the HTTP route rejects files over 5MB and missing authentication.
- With R2 configured, test R2 upload and a Convex → R2 → Convex round trip.
- Check desktop/mobile layouts and the browser console.

Record the commit SHA, backend destination, Pages deployment URL, and results.
The public demo's impersonation and shared admin view are intentional; use test
data only. Before a production rollout, retain the preceding Pages deployment
and backend commit. A frontend rollback alone does not roll back Convex functions.
