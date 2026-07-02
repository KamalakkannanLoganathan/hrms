# QA Remediation Status

## Current Recommendation

Ready for Docker staging validation after the Supabase SQL migration is applied.

Not yet recommended for live payroll production until granular API routes replace the broad app-state persistence endpoint.

## Remediations Completed

- Removed the old ORM-based database path.
- Added direct Supabase server persistence via `server/production-server.mjs`.
- Added signed HTTP-only session cookies.
- Added CSRF validation for mutating API routes.
- Added login rate limiting.
- Added private Supabase Storage bucket SQL.
- Added Dockerfile and docker-compose.
- Added nginx sample for `hrms.terimarevenue.com`.
- Added lint, server security tests, and e2e smoke scripts.
- Added `.gitignore` protection for `.env.local`.

## Remaining High-Priority Items

- Replace broad `/api/state` writes with granular mutation routes:
  - attendance check-in/check-out
  - leave request/approval/rejection
  - payroll create/approve/lock/publish
  - settings/theme update
  - reports/export
  - uploads and signed URL generation
- Add schema-level validation for every route.
- Add browser Playwright e2e tests after deployment target is reachable.
- Add accessibility checks and visual screenshots.
- Add performance fixtures for 50 and 500 employees.

## Validation Commands

```bash
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run test:e2e
pnpm run build
```

## Deployment Validation

After applying `supabase/migrations/001_hrms_app_state.sql` and running Docker:

```bash
curl https://hrms.terimarevenue.com/api/health
```

Expected:

```json
{ "ok": true, "storageBucket": "eagle-rcm-hr-private" }
```
