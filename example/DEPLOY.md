# Deploying to Cloudflare Pages

This guide will help you deploy the example app to Cloudflare Pages.

## Prerequisites

1. **Cloudflare account** - Sign up at [cloudflare.com](https://www.cloudflare.com)
2. **Wrangler CLI** - Cloudflare's command-line tool

## Step-by-Step Deployment

### Step 1: Install Wrangler CLI

If you don't have Wrangler installed, install it globally:

```bash
npm install -g wrangler
```

Or use it via npx (no installation needed):

```bash
npx wrangler --version
```

### Step 2: Login to Cloudflare

Authenticate with Cloudflare:

```bash
wrangler login
```

This will open a browser window for you to authorize Wrangler.

### Step 3: Navigate to the Example Directory

```bash
cd example
```

### Step 4: Install Dependencies

Make sure all dependencies are installed:

```bash
npm install
```

### Step 5: Build the Application

Build the Vite app for production:

```bash
npm run build
```

This will create a `dist` folder with the production build.

### Step 6: Deploy to Cloudflare Pages

Deploy using Wrangler:

```bash
wrangler pages deploy dist --project-name=convex-files-control-example
```

Or if you want to use the environment variable from wrangler.toml:

```bash
VITE_CONVEX_URL=https://intent-tiger-143.convex.cloud npm run build
wrangler pages deploy dist --project-name=convex-files-control-example
```

### Step 7: Set Environment Variable (Alternative Method)

If you prefer to set the environment variable in the Cloudflare dashboard:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** → Your project
3. Go to **Settings** → **Environment Variables**
4. Add a new variable:
   - **Variable name**: `VITE_CONVEX_URL`
   - **Value**: `https://intent-tiger-143.convex.cloud`
5. Save and redeploy

## Quick Deploy Script

You can also create a deploy script. Add this to your `package.json`:

```json
"scripts": {
  "deploy": "VITE_CONVEX_URL=https://intent-tiger-143.convex.cloud npm run build && wrangler pages deploy dist --project-name=convex-files-control-example"
}
```

Then simply run:

```bash
npm run deploy
```

## Continuous Deployment (Optional)

For automatic deployments, you can connect your GitHub repository to Cloudflare Pages:

1. Go to Cloudflare Dashboard → **Workers & Pages** → **Create application**
2. Select **Pages** → **Connect to Git**
3. Select your repository
4. Configure:
   - **Project name**: `convex-files-control-example`
   - **Production branch**: `main` (or your default branch)
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `example`
5. Add environment variable:
   - **Variable name**: `VITE_CONVEX_URL`
   - **Value**: `https://intent-tiger-143.convex.cloud`
6. Save and deploy

## Troubleshooting

### Build fails with missing environment variable

Make sure to set `VITE_CONVEX_URL` before building:

```bash
VITE_CONVEX_URL=https://intent-tiger-143.convex.cloud npm run build
```

### Deployment fails

- Check that you're logged in: `wrangler whoami`
- Verify the `dist` folder exists after building
- Check Cloudflare dashboard for error logs

### App doesn't work after deployment

- Verify the environment variable is set correctly in Cloudflare dashboard
- Check browser console for errors
- Ensure the Convex URL is accessible

## Your Deployment URL

After successful deployment, Cloudflare will provide you with a URL like:
`https://convex-files-control-example.pages.dev`

You can also set up a custom domain in the Cloudflare Pages dashboard.


