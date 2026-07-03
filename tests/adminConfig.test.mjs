import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ||= "anon_test_key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service_role_test_key";
process.env.SUPABASE_STORAGE_BUCKET ||= "eagle-rcm-hr-private";
process.env.AUTH_SECRET ||= "test_secret_value_that_is_long_enough";

const core = await import("../src/hrCore.js");
const shared = await import("../app/api/_shared.js");

const {
  PERMISSIONS,
  ROLES,
  assertUniqueConfigRecord,
  canManageAdminSection,
  canPersistStateChange,
  hasPermission,
  seedAppData,
} = core;

function user(data, role) {
  return data.users.find((item) => item.role === role);
}

test("seeded admin configuration includes production modules", () => {
  const data = seedAppData();
  assert.ok(data.departments.find((item) => item.code === "CRED"));
  assert.ok(data.designations.find((item) => item.code === "PAYEXEC"));
  assert.ok(data.payrollSettings.effectiveFrom);
  assert.ok(data.attendanceSettings.allowAttendanceCorrectionRequest);
  assert.ok(data.reportSettings.maskBankAccountInExports);
  assert.ok(data.notificationSettings.notifyBossPayrollReady);
  assert.ok(data.rolePermissions[ROLES.SUPER_ADMIN].includes(PERMISSIONS.ROLE_MANAGE));
});

test("role defaults match admin configuration access expectations", () => {
  const data = seedAppData();
  assert.equal(canManageAdminSection(user(data, ROLES.SUPER_ADMIN), "rolePermissions", data.rolePermissions), true);
  assert.equal(canManageAdminSection(user(data, ROLES.HR_ADMIN), "departments", data.rolePermissions), true);
  assert.equal(canManageAdminSection(user(data, ROLES.HR_ADMIN), "payrollSettings", data.rolePermissions), false);
  assert.equal(canManageAdminSection(user(data, ROLES.PAYROLL_ADMIN), "payrollSettings", data.rolePermissions), true);
  assert.equal(canManageAdminSection(user(data, ROLES.PAYROLL_ADMIN), "departments", data.rolePermissions), false);
  assert.equal(canManageAdminSection(user(data, ROLES.BOSS), "departments", data.rolePermissions), false);
  assert.equal(canManageAdminSection(user(data, ROLES.MANAGER), "departments", data.rolePermissions), false);
  assert.equal(canManageAdminSection(user(data, ROLES.EMPLOYEE), "departments", data.rolePermissions), false);
});

test("duplicate admin master data is rejected by shared validator", () => {
  const data = seedAppData();
  assert.throws(
    () => assertUniqueConfigRecord(data.departments, { name: "Credentialing", code: "NEW" }, ["name"]),
    /Duplicate name/
  );
  assert.throws(
    () => assertUniqueConfigRecord(data.departments, { name: "New Ops", code: "CRED" }, ["code"]),
    /Duplicate code/
  );
});

test("direct API state authorization blocks sensitive sections by role", () => {
  const data = seedAppData();
  const hr = user(data, ROLES.HR_ADMIN);
  const payroll = user(data, ROLES.PAYROLL_ADMIN);
  const employee = user(data, ROLES.EMPLOYEE);

  const departmentChange = { ...data, departments: [{ ...data.departments[0], name: "Operations HR" }, ...data.departments.slice(1)] };
  const payrollChange = { ...data, payrollSettings: { ...data.payrollSettings, defaultSalaryDays: 26 } };

  assert.equal(canPersistStateChange(hr, data, departmentChange), true);
  assert.equal(canPersistStateChange(employee, data, departmentChange), false);
  assert.equal(canPersistStateChange(hr, data, payrollChange), false);
  assert.equal(canPersistStateChange(payroll, data, payrollChange), true);
  assert.equal(shared.canPersistState(hr, data, payrollChange), false);
});

test("role permission overrides affect checks without changing Super Admin lockout", () => {
  const data = seedAppData();
  const admin = user(data, ROLES.HR_ADMIN);
  const overrides = {
    ...data.rolePermissions,
    [ROLES.HR_ADMIN]: [...data.rolePermissions[ROLES.HR_ADMIN], PERMISSIONS.PAYROLL_SETTINGS_MANAGE],
  };
  assert.equal(hasPermission(admin, PERMISSIONS.PAYROLL_SETTINGS_MANAGE, data.rolePermissions), false);
  assert.equal(hasPermission(admin, PERMISSIONS.PAYROLL_SETTINGS_MANAGE, overrides), true);
  assert.equal(data.rolePermissions[ROLES.SUPER_ADMIN].includes(PERMISSIONS.ROLE_MANAGE), true);
});
