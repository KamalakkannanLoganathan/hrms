import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PASSWORD,
  PERMISSIONS,
  ROLES,
  accrueMonthlyLeave,
  applyLeave,
  approveAttendanceCorrection,
  approveLeaveRequest,
  approvePayrollRun,
  authenticateUser,
  calculateEmployeePayroll,
  canAccessEmployee,
  canAccessPayslip,
  checkIn,
  checkOut,
  createPayrollRun,
  generatePayslips,
  getLeaveBalance,
  hasPermission,
  lockPayrollRun,
  publishPayslips,
  rejectLeaveRequest,
  requestAttendanceCorrection,
  seedAppData,
} from "../src/hrCore.js";

const userByRole = (data, role) => data.users.find((user) => user.role === role);

test("login works for a valid user and rejects invalid password", () => {
  const data = seedAppData();
  const ok = authenticateUser(data.users, "employee@eaglercm.example", DEFAULT_PASSWORD);
  const bad = authenticateUser(data.users, "employee@eaglercm.example", "wrong");
  assert.equal(ok.ok, true);
  assert.equal(bad.ok, false);
});

test("employee cannot access another employee profile or payslip", () => {
  let data = seedAppData();
  const payrollAdmin = userByRole(data, ROLES.PAYROLL_ADMIN);
  const boss = userByRole(data, ROLES.BOSS);
  data = createPayrollRun(data, payrollAdmin, 2026, 6);
  data = approvePayrollRun(data, boss, data.payrollRuns[0].id);
  data = generatePayslips(data, payrollAdmin, data.payrollRuns[0].id);
  const employee = userByRole(data, ROLES.EMPLOYEE);
  const otherEmployee = data.employees.find((item) => item.id !== employee.employeeId);
  const otherPayslip = data.payslips.find((item) => item.employeeId === otherEmployee.id);
  assert.equal(canAccessEmployee(employee, otherEmployee, data.employees), false);
  assert.equal(canAccessPayslip(employee, otherPayslip, data.employees), false);
});

test("manager can access assigned team only", () => {
  const data = seedAppData();
  const manager = userByRole(data, ROLES.MANAGER);
  const teamMember = data.employees.find((employee) => employee.managerId === manager.employeeId);
  const outsideTeam = data.employees.find((employee) => employee.managerId !== manager.employeeId && employee.id !== manager.employeeId);
  assert.equal(canAccessEmployee(manager, teamMember, data.employees), true);
  assert.equal(canAccessEmployee(manager, outsideTeam, data.employees), false);
});

test("HR can manage employee records", () => {
  const data = seedAppData();
  const hr = userByRole(data, ROLES.HR_ADMIN);
  assert.equal(hasPermission(hr, PERMISSIONS.EMPLOYEE_MANAGE), true);
});

test("employee can check in and check out, while invalid punches are blocked", () => {
  let data = seedAppData();
  const employee = userByRole(data, ROLES.EMPLOYEE);
  data.attendanceRecords = data.attendanceRecords.filter((item) => !(item.employeeId === employee.employeeId && item.date === "2026-07-01"));
  data = checkIn(data, employee, new Date("2026-07-01T04:00:00.000Z"));
  assert.throws(() => checkIn(data, employee, new Date("2026-07-01T04:05:00.000Z")), /Duplicate check-in/);
  assert.throws(() => checkOut(data, employee, new Date("2026-07-01T03:30:00.000Z")), /Checkout before check-in/);
  data = checkOut(data, employee, new Date("2026-07-01T13:00:00.000Z"));
  const record = data.attendanceRecords.find((item) => item.employeeId === employee.employeeId && item.date === "2026-07-01");
  assert.equal(record.status, "Present");
});

test("attendance correction approval updates attendance", () => {
  let data = seedAppData();
  const manager = userByRole(data, ROLES.MANAGER);
  data = approveAttendanceCorrection(data, manager, "correction_seed");
  const correction = data.attendanceCorrections.find((item) => item.id === "correction_seed");
  const record = data.attendanceRecords.find((item) => item.employeeId === correction.employeeId && item.date === correction.date);
  assert.equal(correction.status, "approved");
  assert.equal(record.status, "Present");
});

test("leave approval deducts paid balance only after approval and rejected leave does not deduct", () => {
  let data = seedAppData();
  const employee = userByRole(data, ROLES.EMPLOYEE);
  const manager = userByRole(data, ROLES.MANAGER);
  const before = getLeaveBalance(data, employee.employeeId, "lt_cl");
  data = applyLeave(data, employee, {
    leaveTypeId: "lt_cl",
    startDate: "2026-07-03",
    endDate: "2026-07-03",
    days: 1,
    reason: "Family work",
  });
  const pending = data.leaveRequests[0];
  assert.equal(getLeaveBalance(data, employee.employeeId, "lt_cl"), before);
  data = approveLeaveRequest(data, manager, pending.id);
  assert.equal(getLeaveBalance(data, employee.employeeId, "lt_cl"), before - 1);

  data = applyLeave(data, employee, {
    leaveTypeId: "lt_cl",
    startDate: "2026-07-04",
    endDate: "2026-07-04",
    days: 1,
    reason: "Change of plan",
  });
  const rejected = data.leaveRequests[0];
  const afterApproval = getLeaveBalance(data, employee.employeeId, "lt_cl");
  data = rejectLeaveRequest(data, manager, rejected.id);
  assert.equal(getLeaveBalance(data, employee.employeeId, "lt_cl"), afterApproval);
});

test("unpaid leave becomes LOP and monthly accrual adds balance", () => {
  let data = seedAppData();
  const employee = userByRole(data, ROLES.EMPLOYEE);
  const manager = userByRole(data, ROLES.MANAGER);
  const hr = userByRole(data, ROLES.HR_ADMIN);
  const beforeSick = getLeaveBalance(data, employee.employeeId, "lt_sl");
  data = accrueMonthlyLeave(data, hr, 2026, 7);
  assert.equal(getLeaveBalance(data, employee.employeeId, "lt_sl"), beforeSick + 0.5);
  data = applyLeave(data, employee, {
    leaveTypeId: "lt_lop",
    startDate: "2026-07-05",
    endDate: "2026-07-05",
    days: 1,
    reason: "Unpaid leave",
  });
  data = approveLeaveRequest(data, manager, data.leaveRequests[0].id);
  assert.equal(data.leaveRequests[0].lopDays, 1);
});

test("comp off credit and usage works", () => {
  let data = seedAppData();
  const employee = userByRole(data, ROLES.EMPLOYEE);
  const manager = userByRole(data, ROLES.MANAGER);
  const before = getLeaveBalance(data, employee.employeeId, "lt_co");
  data = applyLeave(data, employee, {
    leaveTypeId: "lt_co",
    startDate: "2026-07-08",
    endDate: "2026-07-08",
    days: 1,
    reason: "Use comp off",
  });
  data = approveLeaveRequest(data, manager, data.leaveRequests[0].id);
  assert.equal(getLeaveBalance(data, employee.employeeId, "lt_co"), before - 1);
});

test("payroll payable days, LOP deduction, lock, and payslip access work", () => {
  let data = seedAppData();
  const payrollAdmin = userByRole(data, ROLES.PAYROLL_ADMIN);
  const boss = userByRole(data, ROLES.BOSS);
  data = createPayrollRun(data, payrollAdmin, 2026, 6);
  const run = data.payrollRuns[0];
  const employeeRow = data.payrollRunEmployees.find((item) => item.employeeId === "emp_006");
  assert.equal(run.status, "calculated");
  assert.equal(employeeRow.salaryDays, 30);
  assert.equal(employeeRow.totalEarnings, 60000);
  assert.equal(employeeRow.lopDeduction, 0);
  data = approvePayrollRun(data, boss, run.id);
  data = lockPayrollRun(data, boss, run.id);
  assert.equal(data.payrollRuns[0].status, "locked");
  assert.throws(() => lockPayrollRun(data, boss, run.id), /Only approved payroll/);
  data = generatePayslips(data, payrollAdmin, run.id);
  const employee = userByRole(data, ROLES.EMPLOYEE);
  const ownPayslip = data.payslips.find((item) => item.employeeId === employee.employeeId);
  assert.equal(canAccessPayslip(employee, ownPayslip, data.employees), true);
  assert.equal(canAccessPayslip(boss, ownPayslip, data.employees), true);
});

test("inactive user login fails without exposing account details", () => {
  const data = seedAppData();
  const users = data.users.map((user) => (user.email === "employee@eaglercm.example" ? { ...user, status: "DISABLED" } : user));
  const result = authenticateUser(users, "employee@eaglercm.example", DEFAULT_PASSWORD);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "Invalid email or password.");
});

test("duplicate checkout is blocked after a successful checkout", () => {
  let data = seedAppData();
  const employee = userByRole(data, ROLES.EMPLOYEE);
  data.attendanceRecords = data.attendanceRecords.filter((item) => !(item.employeeId === employee.employeeId && item.date === "2026-07-01"));
  data = checkIn(data, employee, new Date("2026-07-01T04:00:00.000Z"));
  data = checkOut(data, employee, new Date("2026-07-01T13:00:00.000Z"));
  assert.throws(() => checkOut(data, employee, new Date("2026-07-01T13:15:00.000Z")), /Duplicate checkout/);
});

test("attendance correction requires a reason and manager cannot approve outside team", () => {
  let data = seedAppData();
  const employee = userByRole(data, ROLES.EMPLOYEE);
  const manager = userByRole(data, ROLES.MANAGER);
  assert.throws(
    () =>
      requestAttendanceCorrection(data, employee, {
        date: "2026-07-01",
        requestedCheckInAt: "2026-07-01T04:00:00.000Z",
        requestedCheckOutAt: "2026-07-01T13:00:00.000Z",
        reason: "",
      }),
    /reason is required/
  );
  data = {
    ...data,
    attendanceCorrections: [
      {
        id: "correction_outside_team",
        employeeId: "emp_002",
        attendanceRecordId: "",
        date: "2026-06-20",
        requestedCheckInAt: "2026-06-20T04:00:00.000Z",
        requestedCheckOutAt: "2026-06-20T13:00:00.000Z",
        reason: "Forgot punch",
        status: "pending",
        approverId: "",
        remarks: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      ...data.attendanceCorrections,
    ],
  };
  assert.throws(() => approveAttendanceCorrection(data, manager, "correction_outside_team"), /Unauthorized correction approval/);
});

test("leave validation blocks missing reasons, overlapping requests, and manager approvals outside team", () => {
  let data = seedAppData();
  const employee = userByRole(data, ROLES.EMPLOYEE);
  const manager = userByRole(data, ROLES.MANAGER);
  assert.throws(
    () =>
      applyLeave(data, employee, {
        leaveTypeId: "lt_cl",
        startDate: "2026-07-09",
        endDate: "2026-07-09",
        days: 1,
        reason: "",
      }),
    /Leave reason is required/
  );
  data = applyLeave(data, employee, {
    leaveTypeId: "lt_cl",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    days: 2,
    reason: "Family event",
  });
  assert.throws(
    () =>
      applyLeave(data, employee, {
        leaveTypeId: "lt_sl",
        startDate: "2026-08-02",
        endDate: "2026-08-02",
        days: 1,
        reason: "Sick",
      }),
    /Overlapping leave/
  );
  data = {
    ...data,
    leaveRequests: [
      {
        id: "leave_outside_team",
        employeeId: "emp_002",
        leaveTypeId: "lt_cl",
        startDate: "2026-08-10",
        endDate: "2026-08-10",
        days: 1,
        halfDay: false,
        reason: "Outside team",
        documentFileId: "",
        status: "pending",
        lopDays: 0,
        approvalHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      ...data.leaveRequests,
    ],
  };
  assert.throws(() => approveLeaveRequest(data, manager, "leave_outside_team"), /Unauthorized leave approval/);
  assert.throws(() => rejectLeaveRequest(data, manager, "leave_outside_team"), /Unauthorized leave rejection/);
});

test("paid leave beyond available balance converts only excess days to LOP", () => {
  let data = seedAppData();
  const employee = userByRole(data, ROLES.EMPLOYEE);
  const manager = userByRole(data, ROLES.MANAGER);
  const before = getLeaveBalance(data, employee.employeeId, "lt_cl");
  data = applyLeave(data, employee, {
    leaveTypeId: "lt_cl",
    startDate: "2026-09-01",
    endDate: "2026-09-07",
    days: before + 2,
    reason: "Extended family care",
  });
  data = approveLeaveRequest(data, manager, data.leaveRequests[0].id);
  assert.equal(getLeaveBalance(data, employee.employeeId, "lt_cl"), 0);
  assert.equal(data.leaveRequests[0].lopDays, 2);
});

test("payroll guards duplicate runs, unauthorized approval, premature payslips, and publish before lock", () => {
  let data = seedAppData();
  const payrollAdmin = userByRole(data, ROLES.PAYROLL_ADMIN);
  const boss = userByRole(data, ROLES.BOSS);
  data = createPayrollRun(data, payrollAdmin, 2026, 6);
  const run = data.payrollRuns[0];
  assert.throws(() => createPayrollRun(data, payrollAdmin, 2026, 6), /already exists/);
  assert.throws(() => approvePayrollRun(data, payrollAdmin, run.id), /Unauthorized payroll approval/);
  assert.throws(() => generatePayslips(data, payrollAdmin, run.id), /approved payroll/);
  data = approvePayrollRun(data, boss, run.id);
  data = generatePayslips(data, payrollAdmin, run.id);
  assert.throws(() => publishPayslips(data, payrollAdmin, run.id), /after payroll is locked/);
});

test("March 2026 one-day LOP deduction uses calendar salary days", () => {
  let data = seedAppData();
  const employee = userByRole(data, ROLES.EMPLOYEE);
  const manager = userByRole(data, ROLES.MANAGER);
  data = applyLeave(data, employee, {
    leaveTypeId: "lt_lop",
    startDate: "2026-03-03",
    endDate: "2026-03-03",
    days: 1,
    reason: "Unpaid leave",
  });
  data = approveLeaveRequest(data, manager, data.leaveRequests[0].id);
  const row = calculateEmployeePayroll(data, data.employees.find((item) => item.id === employee.employeeId), 2026, 3);
  assert.equal(row.salaryDays, 31);
  assert.equal(row.lopDeduction, 1935.48);
});

test("seed data includes Glassmorphism HR Portal theme defaults", () => {
  const data = seedAppData();
  assert.equal(data.companySettings.selectedTheme, "glassmorphism_hr_portal");
  assert.equal(data.companySettings.themeName, "Glassmorphism HR Portal");
  assert.equal(data.companySettings.primaryColor, "#4F46E5");
  assert.equal(data.companySettings.accentColor, "#06B6D4");
});
