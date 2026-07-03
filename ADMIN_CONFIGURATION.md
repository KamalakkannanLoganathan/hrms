# Eagle RCM Admin Configuration

The Admin Configuration workspace makes HRMS business rules editable by authorized users instead of hard-coding them in the UI. It is available from the sidebar as **Admin Configuration** when the signed-in user has at least one configuration permission.

## Modules

- **Company and Branding**: company name, contact details, timezone, date format, theme colors, login copy, payslip note, and report footer.
- **Departments**: name, uppercase code, description, department head, status, employee count, duplicate prevention, and audit logging.
- **Designations**: designation name/code, department mapping, level/grade, description, status, duplicate prevention within department, and audit logging.
- **Shifts**: start/end time, break minutes, grace period, full-day/half-day thresholds, late/early thresholds, night-shift flag, default status, employee count, and audit logging.
- **Holidays**: date, type, location, department applicability, paid/unpaid status, recurring flag, duplicate date/name validation, and audit logging.
- **Attendance Settings**: employee punch controls, correction workflow, max backdated correction days, approval requirements, auto absent/half-day rules, holiday/weekly-off work, and payroll lock behavior.
- **Leave Types**: paid/unpaid behavior, badge color, approval, half-day, negative balance, document requirement, LOP behavior, accrual, carry-forward, ESS visibility, and history-safe deactivation.
- **Leave Policies**: effective-dated policy records with generated per-leave-type rules for accrual, quota, max balance, carry-forward, expiry, weekly-off, and holiday deduction defaults.
- **Leave Allocation**: manual employee policy assignment and ledger-based balance adjustments with mandatory reason and audit logging.
- **Payroll Settings**: cycle, salary-day basis, closing day, attendance lock day, approval requirements, payslip publish mode, LOP method, half-day deduction, overtime, advance deduction, rounding, currency, payslip number format, and effective date. Each save creates a payroll settings version.
- **Salary Components**: earnings/deductions, fixed/percentage/manual/formula calculation, payslip display, sort order, effective date, and optional inactive PF/ESI/TDS/PT components.
- **Roles and Permissions**: matrix for role privileges. Super Admin remains protected from lockout.
- **Report Settings**: logo/header/date format behavior, bank masking, and export permission settings.
- **Notification Settings**: in-app notification toggles for leave, payslip, payroll readiness, and missing attendance workflows.
- **Audit Logs**: searchable log of configuration and workflow changes.

## Recommended Defaults

- **Super Admin**: all permissions, including role management and company/payroll settings.
- **Admin / HR**: departments, designations, shifts, holidays, attendance settings, leave types, leave policies, leave allocations, HR reports, notifications, and audit logs.
- **Payroll Admin**: payroll settings, salary components, payroll processing, payslips, payroll reports, and audit logs.
- **Boss / Owner**: dashboards, reports, payslips, payroll approval/lock where granted, and audit visibility.
- **Manager / Team Lead**: team visibility, team attendance/leave approvals, and HR reports where granted.
- **Employee**: self-service attendance, leave, and own payslips only.

## Security And Audit Behavior

The Next.js `/api/state` route compares changed top-level state sections before saving. Each sensitive section requires its matching permission, so direct API updates to payroll settings, role permissions, departments, leave policy, salary components, and other admin modules are blocked for unauthorized roles.

Every Admin Configuration save adds an audit entry with actor, role, action, entity type, entity id, previous value where available, new value, timestamp, and server-side IP/user-agent placeholders.

## Business Rule Impact

- Shift configuration is referenced by attendance records through `shiftId`; locked payroll history should not be recalculated silently.
- Holiday configuration is available to attendance/payroll calculations and includes paid/unpaid behavior.
- Leave balances remain ledger-based through `leaveLedgers`; manual allocations create ledger entries.
- Payroll settings are effective-dated and versioned through `payrollSettingsVersions`.
- Report settings control export masking and permission expectations.

## Storage And Database Shape

This project currently uses Supabase PostgreSQL through the `hrms_app_state` JSONB table, secured by server-side APIs and RLS. Prisma has intentionally not been added back, per project direction. The configuration models are persisted as structured JSON collections in that Supabase row.
