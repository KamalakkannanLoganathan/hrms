# Vercel Deployment

## What Was Wrong

Vercel was configured as a Next.js deployment, but the repository did not have a Next.js App Router entry point. The project originally ran as a Vite app, so Vercel could not detect a valid Next app and failed with:

```text
Error: No Next.js version detected.
```

This has been fixed by adding a real Next.js app shell:

- `app/layout.jsx`
- `app/page.jsx`

The existing Eagle RCM portal UI is preserved and rendered through `src/VaultAccess.jsx`.

## Actual App Folder

The actual Next.js app folder is:

```text
app
```

The Vercel project root should be the repository root.

## Vercel Settings

| Setting | Value |
| --- | --- |
| Root Directory | `.` |
| Framework Preset | `Next.js` |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm run build` |
| Output Directory | Leave empty / Vercel default |

Do not set the output directory to `dist` for the Vercel deployment. `dist` is only for the Vite/Docker build path.

## Package Manager

Use pnpm.

Valid lockfile:

```text
pnpm-lock.yaml
```

Removed conflicting lockfile:

```text
package-lock.json
```

## Required Environment Variables

Set these in Vercel Project Settings if you want the same environment values available:

```text
APP_URL=https://hrms.terimarevenue.com
NEXTAUTH_URL=https://hrms.terimarevenue.com
AUTH_SECRET=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=eagle-rcm-hr-private
```

Important: never expose `SUPABASE_SERVICE_ROLE_KEY` to client-side code. Do not create any `NEXT_PUBLIC_` or `VITE_` variable for the service-role key.

## Commands Verified Locally

```bash
pnpm install
pnpm run build
```

`pnpm run build` runs:

```bash
next build
```

## Docker Path Still Exists

The Docker deployment path is preserved separately:

```bash
pnpm run build:vite
pnpm run start:docker-server
docker compose up -d --build
```

Docker uses the Vite build and the Node production server. Vercel uses the Next.js build.

## Redeploy Steps

1. Push the latest commit to GitHub.
2. In Vercel, import or redeploy `KamalakkannanLoganathan/hrms`.
3. Set Root Directory to `.`.
4. Set Framework Preset to `Next.js`.
5. Set Install Command to `pnpm install --frozen-lockfile`.
6. Set Build Command to `pnpm run build`.
7. Leave Output Directory empty.
8. Add the environment variables listed above.
9. Redeploy.
