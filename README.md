# Eagle RCM HRMS Portal

Production HRMS portal for Employee Self Service, Attendance, Leave, Payroll, Payslips, Reports, and Admin Configuration.

## What The App Does

- Secure login with server-side sessions, HTTP-only cookies, CSRF protection, and Supabase-backed persistence.
- Employee master management with departments, designations, managers, shifts, salary structures, and masked bank data.
- Attendance check-in/check-out, attendance records, correction requests, manager/HR approval flow, and exports.
- Leave requests, approvals/rejections, paid/unpaid/LOP behavior, leave balances, leave policies, allocations, and ledger entries.
- Payroll runs, payroll approval/lock, payslip generation/publication, and payroll-ready exports.
- Payslip viewing/printing with company branding.
- Report center for HR/payroll exports.
- Admin Configuration for company branding, departments, designations, holidays, shifts, attendance settings, leave types, leave policies, leave allocation, payroll settings, salary components, roles/permissions, report settings, notification settings, and audit logs.
- Role-based access for Super Admin, Admin/HR, Payroll Admin, Boss/Owner, Manager/Team Lead, and Employee.

## Required Stack

- Next.js App Router
- React
- Supabase PostgreSQL via server-side API routes
- Supabase private Storage bucket
- pnpm

The browser must never receive `SUPABASE_SERVICE_ROLE_KEY`. All privileged Supabase access happens inside Next.js API routes.

## Important Files

- `app/`: Next.js App Router pages and API routes
- `src/VaultAccess.jsx`: HRMS UI
- `src/hrCore.js`: business logic, seed defaults, RBAC helpers
- `supabase/migrations/001_hrms_app_state.sql`: Supabase table, RLS, and private bucket setup
- `scripts/check-supabase-state.mjs`: safe Supabase state validator
- `ADMIN_CONFIGURATION.md`: Admin Configuration modules, permissions, audit behavior, and business-rule impact
- `DEPLOYMENT.md`: Vercel deployment settings
- `tests/`: domain, security, admin configuration, and smoke tests
- `.env.example`: required environment template

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
```

`.env.local` is ignored by Git.

## Supabase Setup

1. Open Supabase SQL editor.
2. Run `supabase/migrations/001_hrms_app_state.sql`.
3. Confirm bucket `eagle-rcm-hr-private` exists and is private.
4. Do not expose the service-role key to client-side code.

The first successful server read seeds `public.hrms_app_state` automatically from `src/hrCore.js` if no state row exists.

## Local Development

```bash
pnpm install
pnpm run dev
```

Open `http://localhost:3000`.

## Validation Commands

```bash
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run test:e2e
pnpm run build
pnpm run supabase:check
```

## Deployment

Use Vercel with the settings in `DEPLOYMENT.md`.

Health check:

```bash
curl https://hrms.terimarevenue.com/api/health
```

Expected:

```json
{ "ok": true, "storageBucket": "eagle-rcm-hr-private" }
```

## Security Notes

- The home page does not display seeded credentials.
- Role permissions are enforced in the UI and server-side state persistence checks.
- Sensitive state writes to admin modules are blocked unless the actor has the required permission.
- Supabase RLS denies direct browser access to the app-state table.
- Private storage access should use signed URLs from the server API.
