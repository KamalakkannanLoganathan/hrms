# Eagle RCM HRMS Portal

Employee Self Service, Attendance, Leave, Payroll, Payslip, Reports, and Admin portal for Eagle RCM.

## Current Architecture

- Frontend: Vite + React
- Production server: Node HTTP server in `server/production-server.mjs`
- Database: Supabase PostgreSQL via direct server-side REST calls
- Storage: private Supabase Storage bucket
- Auth: server-side credential login with signed HTTP-only cookies
- CSRF: same-origin CSRF token for mutating API requests
- Deployment: Docker behind `hrms.terimarevenue.com`

The browser must never receive the Supabase service-role key. All privileged Supabase access happens only inside the Docker server.

## Important Files

- `src/VaultAccess.jsx`: HRMS UI
- `src/hrCore.js`: business logic, seed data, RBAC helpers
- `server/production-server.mjs`: production app server and API
- `supabase/migrations/001_hrms_app_state.sql`: Supabase table, RLS, and private bucket setup
- `Dockerfile`: production container
- `docker-compose.yml`: local/server container orchestration
- `deploy/nginx-hrms.terimarevenue.com.conf`: nginx reverse proxy sample
- `.env.example`: required environment template
- `tests/`: domain, server-security, and deployment smoke tests

## Environment

Create `.env.local`:

```bash
APP_URL=https://hrms.terimarevenue.com
NEXTAUTH_URL=https://hrms.terimarevenue.com
AUTH_SECRET=replace-with-at-least-24-random-characters
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=eagle-rcm-hr-private
PORT=3000
```

`.env.local` is ignored by Git.

## Supabase Setup

1. Open Supabase SQL editor.
2. Run `supabase/migrations/001_hrms_app_state.sql`.
3. Confirm bucket `eagle-rcm-hr-private` exists and is private.
4. Do not expose the service-role key to client-side code.

The first successful server read seeds `public.hrms_app_state` automatically from `src/hrCore.js` if no state row exists.

## Local Development

Frontend-only development:

```bash
pnpm install
pnpm run dev
```

Production-like server:

```bash
pnpm run build
pnpm run start
```

Open `http://localhost:3000`.

## Docker Deployment

```bash
docker compose up -d --build
```

Container listens on host port `3000`.

Health check:

```bash
curl https://hrms.terimarevenue.com/api/health
```

Expected:

```json
{ "ok": true, "storageBucket": "eagle-rcm-hr-private" }
```

## DNS and Subdomain

For `hrms.terimarevenue.com`:

- Use a `CNAME` if pointing to a managed proxy/load balancer hostname.
- Use an `A` record if pointing directly to a VPS/server IP.

Example CNAME:

```text
Type: CNAME
Name: hrms
Value: your-proxy-or-hostname
```

Use `deploy/nginx-hrms.terimarevenue.com.conf` for nginx reverse proxy with TLS.

## Commands

```bash
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run test:e2e
pnpm run build
pnpm run start
pnpm run docker:build
```

## Seeded Login Credentials

Default password:

```text
Eagle@12345
```

Seeded users:

- `superadmin@eaglercm.example`
- `hr@eaglercm.example`
- `payroll@eaglercm.example`
- `boss@eaglercm.example`
- `manager@eaglercm.example`
- `employee@eaglercm.example`

## Production Notes

Implemented:

- Server-side session cookie
- CSRF guard for mutations
- Login rate limiting
- Server-only Supabase service role use
- Private storage bucket migration
- Docker deployment assets
- Basic direct Supabase persistence

Still recommended:

- Replace broad app-state saves with granular API routes per workflow.
- Add normalized SQL tables for long-term maintainability.
- Add upload endpoints with MIME and size validation.
- Add full Playwright browser e2e and axe accessibility tests.
- Add 50/500 employee performance fixtures.
- Add server-generated PDF payslips.
