# Eagle RCM Direct Supabase + Docker Action Plan

## Confirmed Direction

- Prisma is removed.
- Persistence uses Supabase PostgreSQL directly through a server-side Node API.
- The Supabase service-role key is used only by the Docker server, never by browser code.
- Deployment target is Docker behind `hrms.terimarevenue.com`.

## Implemented Foundation

- `server/production-server.mjs` serves the built Vite app and same-origin API routes.
- Server-side login uses signed HTTP-only cookies.
- CSRF token checks protect mutating API routes.
- Login rate limiting is enabled in memory.
- App data persists in Supabase table `public.hrms_app_state`.
- Direct browser table access is denied through RLS.
- Private Supabase Storage bucket SQL is provided.
- Dockerfile and docker-compose are provided.
- Nginx reverse-proxy sample is provided for `hrms.terimarevenue.com`.

## Remaining Production Hardening

- Replace broad `/api/state` persistence with granular API routes for each mutation.
- Add per-route Zod-style validation or install Zod if dependency installs are allowed.
- Add normalized SQL tables when ready to move beyond the JSON app-state table.
- Add signed upload endpoints for logo/documents with MIME and size validation.
- Add direct API authorization tests for every granular route.
- Add Playwright browser e2e and axe accessibility tests.
- Add 50/500 employee performance fixtures.

## Deployment Steps

1. Apply `supabase/migrations/001_hrms_app_state.sql` in the Supabase SQL editor.
2. Confirm `.env.local` contains:
   - `APP_URL=https://hrms.terimarevenue.com`
   - `NEXTAUTH_URL=https://hrms.terimarevenue.com`
   - `AUTH_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_STORAGE_BUCKET`
3. Build and run:

```bash
docker compose up -d --build
```

4. Point DNS:

```text
Type: CNAME
Name: hrms
Value: your server/proxy target
```

If using a VPS directly, point `hrms.terimarevenue.com` to the server IP with an `A` record instead.

5. Install TLS certificate and use `deploy/nginx-hrms.terimarevenue.com.conf` as the reverse proxy.

## Definition of Done

- Docker container starts with env validation.
- Supabase migration is applied.
- Login sets secure HTTP-only cookies on HTTPS.
- Browser never receives `SUPABASE_SERVICE_ROLE_KEY`.
- App state persists through `/api/state`.
- Build, lint, tests, e2e smoke tests pass.
- `https://hrms.terimarevenue.com/api/health` returns `{ "ok": true }`.
