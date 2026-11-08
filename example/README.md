# Files Control demo

A React/Vite app using the local `file:..` library, Convex Auth, Convex storage,
and optional Cloudflare R2. It demonstrates presigned and HTTP uploads, virtual
paths, access keys, password-protected download grants, provider transfers, and
scheduled expiration cleanup.

This is a **shared public sandbox**: the user switcher deliberately impersonates
demo users and the administration view exposes their files. Use disposable test
data only. Replace this authentication and enforce administrator roles before
adapting it for a private app.

## Run locally

Run these commands from the **repository root**, with Node 24:

```sh
npm ci
npm --prefix example ci
npm run build
npx convex dev --once
node example/node_modules/@convex-dev/auth/dist/bin.cjs --web-server-url http://localhost:5173
npx convex dev --once --run seed:demoUsers
npm run dev
```

The seed is internal and only adds Alice and Bob if the users table is empty.
Select a demo user, upload a small test file, then try sharing, expiration, and
deletion. Files are capped at 5MB by the UI and HTTP upload route; the example
caps file expiration at 24 hours. Presigned uploads bypass the HTTP size check;
production applications must validate actual stored object sizes server-side.

Vite reads **root `.env.local`**, written by the Convex CLI. It does not read an
old `example/.env.local`. There is no fallback to the public demo backend.
`VITE_CONVEX_URL` is required; hosted Convex HTTP URLs are derived from it. Local
or custom deployments also need `VITE_CONVEX_SITE_URL` (see root `.env.example`).
Restart Vite after changing environment files.

The auth setup configures `SITE_URL`, `JWT_PRIVATE_KEY`, and `JWKS` on the selected
deployment. These values are separate for each dev/production deployment.

## Optional R2

Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME`
on the Convex deployment, optionally `R2_JURISDICTION`. Configure bucket CORS to
allow your frontend origin, PUT/GET requests, and Content-Type. Without these
settings, use Convex storage; R2 upload and transfer report a configuration error.
Never put R2 credentials in Vite environment variables.

## Validate and deploy

`npm run check` from the root validates both projects. `npm run test:coverage`
includes component, HTTP routing, React upload helpers, and example integration
coverage. [DEPLOY.md](DEPLOY.md) covers coordinated backend/frontend deployment
and a repeatable smoke checklist.
