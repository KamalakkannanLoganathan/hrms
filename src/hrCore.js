import bcrypt from "bcryptjs";

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  HR_ADMIN: "HR_ADMIN",
  PAYROLL_ADMIN: "PAYROLL_ADMIN",
  BOSS: "BOSS",
  MANAGER: "MANAGER",
  EMPLOYEE: "EMPLOYEE",
};

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: "Super Admin",
  [ROLES.HR_ADMIN]: "Admin / HR",
  [ROLES.PAYROLL_ADMIN]: "Payroll Admin",
  [ROLES.BOSS]: "Boss / Owner",
  [ROLES.MANAGER]: "Manager / Team Lead",
  [ROLES.EMPLOYEE]: "Employee",
};

export const PERMISSIONS = {
  SETTINGS_MANAGE: "settings.manage",
  EMPLOYEE_MANAGE: "employee.manage",
  EMPLOYEE_READ_ALL: "employee.read_all",
  TEAM_READ: "team.read",
  ATTENDANCE_SELF: "attendance.self",
  ATTENDANCE_MANAGE: "attendance.manage",
  ATTENDANCE_APPROVE: "attendance.approve",
  LEAVE_SELF: "leave.self",
  LEAVE_MANAGE: "leave.manage",
  LEAVE_APPROVE: "leave.approve",
  PAYROLL_MANAGE: "payroll.manage",
  PAYROLL_APPROVE: "payroll.approve",
  PAYSLIP_READ_OWN: "payslip.read_own",
  PAYSLIP_READ_ALL: "payslip.read_all",
  REPORTS_HR: "reports.hr",
  REPORTS_PAYROLL: "reports.payroll",
  AUDIT_READ: "audit.read",
};

export const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),
  [ROLES.HR_ADMIN]: [
    PERMISSIONS.EMPLOYEE_MANAGE,
    PERMISSIONS.EMPLOYEE_READ_ALL,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.ATTENDANCE_APPROVE,
    PERMISSIONS.LEAVE_MANAGE,
    PERMISSIONS.LEAVE_APPROVE,
    PERMISSIONS.REPORTS_HR,
    PERMISSIONS.AUDIT_READ,
  ],
  [ROLES.PAYROLL_ADMIN]: [
    PERMISSIONS.PAYROLL_MANAGE,
    PERMISSIONS.PAYSLIP_READ_ALL,
    PERMISSIONS.REPORTS_PAYROLL,
    PERMISSIONS.AUDIT_READ,
  ],
  [ROLES.BOSS]: [
    PERMISSIONS.EMPLOYEE_READ_ALL,
    PERMISSIONS.PAYROLL_APPROVE,
    PERMISSIONS.PAYSLIP_READ_ALL,
    PERMISSIONS.REPORTS_HR,
    PERMISSIONS.REPORTS_PAYROLL,
    PERMISSIONS.AUDIT_READ,
  ],
  [ROLES.MANAGER]: [
    PERMISSIONS.TEAM_READ,
    PERMISSIONS.ATTENDANCE_APPROVE,
    PERMISSIONS.LEAVE_APPROVE,
    PERMISSIONS.REPORTS_HR,
  ],
  [ROLES.EMPLOYEE]: [
    PERMISSIONS.ATTENDANCE_SELF,
    PERMISSIONS.LEAVE_SELF,
    PERMISSIONS.PAYSLIP_READ_OWN,
  ],
};

export const DEFAULT_COMPANY = {
  id: "company_eagle_rcm",
  companyName: "Eagle RCM",
  country: "India",
  currency: "INR",
  timezone: "Asia/Kolkata",
  dateFormat: "DD/MM/YYYY",
  employeeCodePrefix: "ERCM",
  payrollCycle: "Monthly",
  salaryDayCalculation: "Calendar days in month",
  payslipTitleFormat: "PAYSLIP FOR THE MONTH OF {MONTH} {YEAR}",
  address:
    "No. 21 Kamakshi Apartment,\nRajaji Street,\nNehru Nagar,\nChromepet,\n600044,\nTamil Nadu,\nIndia",
  companyEmail: "hr@eaglrcm.example",
  companyPhone: "+91 44 0000 0000",
  website: "https://hr.companydomain.com",
  themeColor: "#4F46E5",
  selectedTheme: "glassmorphism_hr_portal",
  themeName: "Glassmorphism HR Portal",
  primaryColor: "#4F46E5",
  secondaryColor: "#7C3AED",
  accentColor: "#06B6D4",
  loginTitle: "Eagle RCM Employee Portal",
  loginSubtitle: "Attendance, leave, payroll, and payslips in one secure place.",
  payslipNote: "This is a computer-generated document and does not require a signature.",
  payslipFooter: "Eagle RCM HR & Payroll",
  reportHeader: "Eagle RCM HR Reports",
  reportFooter: "Confidential employee information",
};

export const DEFAULT_PASSWORD = "Eagle@12345";

const nowIso = () => new Date().toISOString();
const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const hashPassword = (password) => bcrypt.hashSync(password, bcrypt.genSaltSync(8));

export function formatINR(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function getMonthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function maskBank(accountNumber = "") {
  const value = String(accountNumber);
  if (value.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

export function hasPermission(user, permission) {
  if (!user) return false;
  return (ROLE_PERMISSIONS[user.role] || []).includes(permission);
}

export function authenticateUser(users, email, password) {
  const user = users.find((item) => item.email.toLowerCase() === String(email).trim().toLowerCase());
  if (!user || user.status !== "ACTIVE") return { ok: false, reason: "Invalid email or password." };
  if (user.lockedUntil && Date.now() < new Date(user.lockedUntil).getTime()) {
    return { ok: false, reason: "Account is temporarily locked." };
  }
  if (!bcrypt.compareSync(password, user.passwordHash)) return { ok: false, reason: "Invalid email or password." };
  return { ok: true, user: { ...user, lastLoginAt: nowIso(), failedLoginAttempts: 0, lockedUntil: "" } };
}

export function canAccessEmployee(actor, employee, employees = []) {
  if (!actor || !employee) return false;
  if (hasPermission(actor, PERMISSIONS.EMPLOYEE_READ_ALL) || hasPermission(actor, PERMISSIONS.EMPLOYEE_MANAGE)) return true;
  if (actor.employeeId === employee.id) return true;
  if (actor.role === ROLES.MANAGER) {
    return employees.some((item) => item.id === employee.id && item.managerId === actor.employeeId);
  }
  return false;
}

export function canAccessPayslip(actor, payslip, employees = []) {
  if (!actor || !payslip) return false;
  if (hasPermission(actor, PERMISSIONS.PAYSLIP_READ_ALL)) return true;
  const employee = employees.find((item) => item.id === payslip.employeeId);
  return hasPermission(actor, PERMISSIONS.PAYSLIP_READ_OWN) && employee?.id === actor.employeeId;
}

function canApproveEmployeeWorkflow(data, actor, employeeId, managePermission) {
  if (hasPermission(actor, managePermission) || actor?.role === ROLES.SUPER_ADMIN) return true;
  const employee = data.employees.find((item) => item.id === employeeId);
  return actor?.role === ROLES.MANAGER && employee?.managerId === actor.employeeId && employee.id !== actor.employeeId;
}

export function addAudit(data, actor, action, entityType, entityId, previousValue = null, newValue = null) {
  return {
    ...data,
    auditLogs: [
      {
        id: uid("audit"),
        actorUserId: actor?.id || "system",
        actorRole: actor?.role || "SYSTEM",
        action,
        entityType,
        entityId,
        previousValue,
        newValue,
        ipAddress: "captured-server-side",
        userAgent: "captured-server-side",
        timestamp: nowIso(),
      },
      ...data.auditLogs,
    ],
  };
}

function minutesBetween(startIso, endIso) {
  return Math.max(0, (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
}

export function checkIn(data, actor, at = new Date()) {
  if (!hasPermission(actor, PERMISSIONS.ATTENDANCE_SELF)) throw new Error("Unauthorized attendance action.");
  const employee = data.employees.find((item) => item.id === actor.employeeId);
  const date = at.toISOString().slice(0, 10);
  const existing = data.attendanceRecords.find((item) => item.employeeId === employee.id && item.date === date);
  if (existing?.checkInAt) throw new Error("Duplicate check-in is not allowed.");
  const record = {
    id: existing?.id || uid("att"),
    employeeId: employee.id,
    date,
    checkInAt: at.toISOString(),
    checkOutAt: existing?.checkOutAt || "",
    totalWorkedHours: 0,
    status: "Present",
    shiftId: employee.shiftId,
    late: false,
    earlyExit: false,
    halfDay: false,
    source: "web",
    ipAddress: "captured-server-side",
    userAgent: "captured-server-side",
    editedBy: "",
    editReason: "",
    approvalStatus: "approved",
    locked: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const attendanceRecords = existing
    ? data.attendanceRecords.map((item) => (item.id === existing.id ? record : item))
    : [record, ...data.attendanceRecords];
  return addAudit({ ...data, attendanceRecords }, actor, "Attendance marked", "AttendanceRecord", record.id, null, record);
}

export function checkOut(data, actor, at = new Date()) {
  if (!hasPermission(actor, PERMISSIONS.ATTENDANCE_SELF)) throw new Error("Unauthorized attendance action.");
  const date = at.toISOString().slice(0, 10);
  const record = data.attendanceRecords.find((item) => item.employeeId === actor.employeeId && item.date === date);
  if (!record?.checkInAt) throw new Error("Checkout before check-in is not allowed.");
  if (record.checkOutAt) throw new Error("Duplicate checkout is not allowed.");
  if (new Date(at).getTime() < new Date(record.checkInAt).getTime()) throw new Error("Checkout before check-in is not allowed.");
  const hours = minutesBetween(record.checkInAt, at.toISOString()) / 60;
  const updated = {
    ...record,
    checkOutAt: at.toISOString(),
    totalWorkedHours: Number(hours.toFixed(2)),
    status: hours >= 8 ? "Present" : hours >= 4 ? "Half Day" : "Absent",
    halfDay: hours >= 4 && hours < 8,
    updatedAt: nowIso(),
  };
  const attendanceRecords = data.attendanceRecords.map((item) => (item.id === record.id ? updated : item));
  return addAudit({ ...data, attendanceRecords }, actor, "Attendance checked out", "AttendanceRecord", record.id, record, updated);
}

export function requestAttendanceCorrection(data, actor, correction) {
  if (!hasPermission(actor, PERMISSIONS.ATTENDANCE_SELF)) throw new Error("Unauthorized correction request.");
  if (!String(correction.reason || "").trim()) throw new Error("Attendance correction reason is required.");
  const item = {
    id: uid("correction"),
    employeeId: actor.employeeId,
    attendanceRecordId: correction.attendanceRecordId || "",
    date: correction.date,
    requestedCheckInAt: correction.requestedCheckInAt,
    requestedCheckOutAt: correction.requestedCheckOutAt,
    reason: correction.reason,
    status: "pending",
    approverId: "",
    remarks: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return addAudit(
    { ...data, attendanceCorrections: [item, ...data.attendanceCorrections] },
    actor,
    "Attendance correction submitted",
    "AttendanceCorrectionRequest",
    item.id,
    null,
    item
  );
}

export function approveAttendanceCorrection(data, actor, correctionId, remarks = "Approved") {
  if (!hasPermission(actor, PERMISSIONS.ATTENDANCE_APPROVE)) throw new Error("Unauthorized correction approval.");
  const correction = data.attendanceCorrections.find((item) => item.id === correctionId);
  if (!correction || correction.status !== "pending") throw new Error("Correction request is not pending.");
  if (!canApproveEmployeeWorkflow(data, actor, correction.employeeId, PERMISSIONS.ATTENDANCE_MANAGE)) {
    throw new Error("Unauthorized correction approval for this employee.");
  }
  const existing = data.attendanceRecords.find(
    (item) => item.id === correction.attendanceRecordId || (item.employeeId === correction.employeeId && item.date === correction.date)
  );
  const worked = correction.requestedCheckInAt && correction.requestedCheckOutAt
    ? minutesBetween(correction.requestedCheckInAt, correction.requestedCheckOutAt) / 60
    : 0;
  const record = {
    ...(existing || {
      id: uid("att"),
      employeeId: correction.employeeId,
      date: correction.date,
      shiftId: data.employees.find((item) => item.id === correction.employeeId)?.shiftId || "",
      source: "web",
      locked: false,
      createdAt: nowIso(),
    }),
    checkInAt: correction.requestedCheckInAt,
    checkOutAt: correction.requestedCheckOutAt,
    totalWorkedHours: Number(worked.toFixed(2)),
    status: worked >= 8 ? "Present" : worked >= 4 ? "Half Day" : "Absent",
    halfDay: worked >= 4 && worked < 8,
    approvalStatus: "approved",
    editedBy: actor.id,
    editReason: correction.reason,
    updatedAt: nowIso(),
  };
  const attendanceRecords = existing
    ? data.attendanceRecords.map((item) => (item.id === existing.id ? record : item))
    : [record, ...data.attendanceRecords];
  const attendanceCorrections = data.attendanceCorrections.map((item) =>
    item.id === correctionId ? { ...item, status: "approved", approverId: actor.id, remarks, updatedAt: nowIso() } : item
  );
  return addAudit(
    { ...data, attendanceRecords, attendanceCorrections },
    actor,
    "Attendance correction approved",
    "AttendanceCorrectionRequest",
    correctionId,
    correction,
    record
  );
}

export function getLeaveBalance(data, employeeId, leaveTypeId) {
  return data.leaveLedgers
    .filter((item) => item.employeeId === employeeId && item.leaveTypeId === leaveTypeId)
    .reduce((sum, item) => sum + Number(item.days || 0), 0);
}

export function applyLeave(data, actor, request) {
  if (!hasPermission(actor, PERMISSIONS.LEAVE_SELF)) throw new Error("Unauthorized leave request.");
  const leaveType = data.leaveTypes.find((item) => item.id === request.leaveTypeId);
  if (!leaveType) throw new Error("Leave type is required.");
  if (!String(request.reason || "").trim()) throw new Error("Leave reason is required.");
  const days = Number(request.days || 1);
  if (!Number.isFinite(days) || days <= 0) throw new Error("Leave days must be greater than zero.");
  const overlaps = data.leaveRequests.some(
    (item) =>
      item.employeeId === actor.employeeId &&
      ["pending", "approved"].includes(item.status) &&
      request.startDate <= item.endDate &&
      request.endDate >= item.startDate
  );
  if (overlaps) throw new Error("Overlapping leave request is not allowed.");
  const item = {
    id: uid("leave"),
    employeeId: actor.employeeId,
    leaveTypeId: request.leaveTypeId,
    startDate: request.startDate,
    endDate: request.endDate,
    days,
    halfDay: Boolean(request.halfDay),
    reason: request.reason,
    documentFileId: request.documentFileId || "",
    status: leaveType.requiresApproval ? "pending" : "approved",
    approvalHistory: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const next = { ...data, leaveRequests: [item, ...data.leaveRequests] };
  return addAudit(next, actor, "Leave requested", "LeaveRequest", item.id, null, item);
}

export function approveLeaveRequest(data, actor, leaveRequestId, remarks = "Approved") {
  if (!hasPermission(actor, PERMISSIONS.LEAVE_APPROVE) && !hasPermission(actor, PERMISSIONS.LEAVE_MANAGE)) {
    throw new Error("Unauthorized leave approval.");
  }
  const request = data.leaveRequests.find((item) => item.id === leaveRequestId);
  if (!request || request.status !== "pending") throw new Error("Leave request is not pending.");
  if (!canApproveEmployeeWorkflow(data, actor, request.employeeId, PERMISSIONS.LEAVE_MANAGE)) {
    throw new Error("Unauthorized leave approval for this employee.");
  }
  const leaveType = data.leaveTypes.find((item) => item.id === request.leaveTypeId);
  const balance = getLeaveBalance(data, request.employeeId, request.leaveTypeId);
  const days = Number(request.days || 0);
  const paidDays = leaveType.paid && !leaveType.countsTowardLop ? (leaveType.allowNegativeBalance ? days : Math.min(days, Math.max(0, balance))) : 0;
  const ledgerDays = paidDays ? -paidDays : 0;
  const lopDays = leaveType.countsTowardLop ? days : leaveType.paid && !leaveType.allowNegativeBalance ? Math.max(0, days - Math.max(0, balance)) : 0;
  const ledger = ledgerDays
    ? [
        {
          id: uid("ledger"),
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          source: "leave_approval",
          referenceId: request.id,
          days: ledgerDays,
          note: `Approved ${leaveType.name}`,
          createdAt: nowIso(),
        },
        ...data.leaveLedgers,
      ]
    : data.leaveLedgers;
  const leaveRequests = data.leaveRequests.map((item) =>
    item.id === leaveRequestId
      ? {
          ...item,
          status: "approved",
          lopDays,
          approvalHistory: [
            ...item.approvalHistory,
            { approverId: actor.id, approverRole: actor.role, status: "approved", remarks, timestamp: nowIso() },
          ],
          updatedAt: nowIso(),
        }
      : item
  );
  return addAudit({ ...data, leaveRequests, leaveLedgers: ledger }, actor, "Leave approved", "LeaveRequest", request.id, request, {
    status: "approved",
    lopDays,
  });
}

export function rejectLeaveRequest(data, actor, leaveRequestId, remarks = "Rejected") {
  if (!hasPermission(actor, PERMISSIONS.LEAVE_APPROVE) && !hasPermission(actor, PERMISSIONS.LEAVE_MANAGE)) {
    throw new Error("Unauthorized leave rejection.");
  }
  const request = data.leaveRequests.find((item) => item.id === leaveRequestId);
  if (!request || request.status !== "pending") throw new Error("Leave request is not pending.");
  if (!canApproveEmployeeWorkflow(data, actor, request.employeeId, PERMISSIONS.LEAVE_MANAGE)) {
    throw new Error("Unauthorized leave rejection for this employee.");
  }
  const leaveRequests = data.leaveRequests.map((item) =>
    item.id === leaveRequestId
      ? {
          ...item,
          status: "rejected",
          approvalHistory: [
            ...item.approvalHistory,
            { approverId: actor.id, approverRole: actor.role, status: "rejected", remarks, timestamp: nowIso() },
          ],
          updatedAt: nowIso(),
        }
      : item
  );
  return addAudit({ ...data, leaveRequests }, actor, "Leave rejected", "LeaveRequest", leaveRequestId, request, { status: "rejected" });
}

export function accrueMonthlyLeave(data, actor, year, month) {
  if (!hasPermission(actor, PERMISSIONS.LEAVE_MANAGE) && !hasPermission(actor, PERMISSIONS.SETTINGS_MANAGE)) {
    throw new Error("Unauthorized leave accrual.");
  }
  const monthKey = getMonthKey(year, month);
  const entries = [];
  data.employees
    .filter((employee) => employee.status === "active")
    .forEach((employee) => {
      data.leaveTypes
        .filter((type) => type.active && type.paid && Number(type.monthlyAccrual) > 0)
        .forEach((type) => {
          const exists = data.leaveLedgers.some(
            (ledger) => ledger.employeeId === employee.id && ledger.leaveTypeId === type.id && ledger.source === "monthly_accrual" && ledger.referenceId === monthKey
          );
          if (!exists) {
            entries.push({
              id: uid("ledger"),
              employeeId: employee.id,
              leaveTypeId: type.id,
              source: "monthly_accrual",
              referenceId: monthKey,
              days: Number(type.monthlyAccrual),
              note: `${monthKey} accrual`,
              createdAt: nowIso(),
            });
          }
        });
    });
  return addAudit({ ...data, leaveLedgers: [...entries, ...data.leaveLedgers] }, actor, "Monthly leave accrual", "LeaveLedger", monthKey, null, {
    entries: entries.length,
  });
}

export function calculateEmployeePayroll(data, employee, year, month, adjustments = []) {
  const salaryDays = daysInMonth(year, month);
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(salaryDays).padStart(2, "0")}`;
  const attendance = data.attendanceRecords.filter((item) => item.employeeId === employee.id && item.date >= monthStart && item.date <= monthEnd);
  const approvedLeaves = data.leaveRequests.filter((item) => item.employeeId === employee.id && item.status === "approved" && item.startDate >= monthStart && item.startDate <= monthEnd);
  const salary = data.salaryStructures.find(
    (item) =>
      item.employeeId === employee.id &&
      item.status === "active" &&
      item.effectiveFrom <= monthEnd &&
      (!item.effectiveTo || item.effectiveTo >= monthStart)
  );
  const presentDays = attendance.filter((item) => item.status === "Present" || item.status === "Late").length;
  const halfDays = attendance.filter((item) => item.status === "Half Day").length;
  const paidLeaveDays = approvedLeaves
    .filter((item) => data.leaveTypes.find((type) => type.id === item.leaveTypeId)?.paid)
    .reduce((sum, item) => sum + Number(item.days || 0), 0);
  const lopDays = approvedLeaves.reduce((sum, item) => sum + Number(item.lopDays || 0), 0);
  const payableDays = Math.max(0, presentDays + paidLeaveDays + halfDays * 0.5 + Math.max(0, salaryDays - attendance.length - lopDays));
  const grossMonthlySalary = Number(salary?.grossMonthlySalary || 0);
  const componentValues = salary?.items || [];
  const earningItems = componentValues.filter((item) => item.type === "earning");
  const variableEarnings = adjustments.filter((item) => item.type === "earning").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const advanceDeduction = adjustments
    .filter((item) => item.type === "deduction" && item.componentCode === "ADVANCE")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const otherDeductions = adjustments
    .filter((item) => item.type === "deduction" && item.componentCode !== "ADVANCE")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const lopDeduction = Number(((grossMonthlySalary / salaryDays) * lopDays).toFixed(2));
  const totalEarnings = Number((earningItems.reduce((sum, item) => sum + Number(item.amount || 0), 0) + variableEarnings).toFixed(2));
  const totalDeductions = Number((lopDeduction + advanceDeduction + otherDeductions).toFixed(2));
  const netPay = Math.max(0, Number((totalEarnings - totalDeductions).toFixed(2)));
  return {
    employeeId: employee.id,
    employeeName: employee.fullName,
    departmentId: employee.departmentId,
    designationId: employee.designationId,
    payrollMonth: month,
    payrollYear: year,
    calendarDays: salaryDays,
    salaryDays,
    presentDays,
    paidLeaveDays,
    sickLeaveDays: approvedLeaves
      .filter((item) => data.leaveTypes.find((type) => type.id === item.leaveTypeId)?.code === "SL")
      .reduce((sum, item) => sum + Number(item.days || 0), 0),
    casualLeaveDays: approvedLeaves
      .filter((item) => data.leaveTypes.find((type) => type.id === item.leaveTypeId)?.code === "CL")
      .reduce((sum, item) => sum + Number(item.days || 0), 0),
    compOffDays: approvedLeaves
      .filter((item) => data.leaveTypes.find((type) => type.id === item.leaveTypeId)?.code === "CO")
      .reduce((sum, item) => sum + Number(item.days || 0), 0),
    lopDays,
    halfDays,
    otDays: adjustments.filter((item) => item.componentCode === "OT").reduce((sum, item) => sum + Number(item.units || 0), 0),
    holidays: data.holidays.filter((item) => item.date >= monthStart && item.date <= monthEnd).length,
    weeklyOffs: Math.floor(salaryDays / 7) * 2,
    payableDays,
    grossMonthlySalary,
    variableEarnings,
    lopDeduction,
    advanceDeduction,
    otherDeductions,
    totalEarnings,
    totalDeductions,
    netPay,
    status: "calculated",
    remarks: salary ? "Ready for review" : "Missing salary structure",
    componentItems: componentValues,
  };
}

export function createPayrollRun(data, actor, year, month) {
  if (!hasPermission(actor, PERMISSIONS.PAYROLL_MANAGE)) throw new Error("Unauthorized payroll creation.");
  const existing = data.payrollRuns.find((item) => item.year === year && item.month === month && item.status !== "cancelled");
  if (existing) throw new Error("Payroll run already exists for this month.");
  const adjustments = data.payrollAdjustments.filter((item) => item.year === year && item.month === month);
  const employees = data.employees.filter((item) => item.status === "active");
  const employeeRows = employees.map((employee) =>
    calculateEmployeePayroll(
      data,
      employee,
      year,
      month,
      adjustments.filter((item) => item.employeeId === employee.id)
    )
  );
  const run = {
    id: uid("payroll"),
    month,
    year,
    status: "calculated",
    createdBy: actor.id,
    approvedBy: "",
    lockedAt: "",
    publishedAt: "",
    totalEmployees: employeeRows.length,
    grossTotal: employeeRows.reduce((sum, row) => sum + row.totalEarnings, 0),
    deductionTotal: employeeRows.reduce((sum, row) => sum + row.totalDeductions, 0),
    netTotal: employeeRows.reduce((sum, row) => sum + row.netPay, 0),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return addAudit(
    { ...data, payrollRuns: [run, ...data.payrollRuns], payrollRunEmployees: [...employeeRows.map((row) => ({ ...row, id: uid("payemp"), payrollRunId: run.id })), ...data.payrollRunEmployees] },
    actor,
    "Payroll calculated",
    "PayrollRun",
    run.id,
    null,
    run
  );
}

export function approvePayrollRun(data, actor, payrollRunId) {
  if (!hasPermission(actor, PERMISSIONS.PAYROLL_APPROVE)) throw new Error("Unauthorized payroll approval.");
  const run = data.payrollRuns.find((item) => item.id === payrollRunId);
  if (!run || !["calculated", "under_review"].includes(run.status)) throw new Error("Payroll cannot be approved.");
  const payrollRuns = data.payrollRuns.map((item) =>
    item.id === payrollRunId ? { ...item, status: "approved", approvedBy: actor.id, updatedAt: nowIso() } : item
  );
  return addAudit({ ...data, payrollRuns }, actor, "Payroll approved", "PayrollRun", payrollRunId, run, { status: "approved" });
}

export function lockPayrollRun(data, actor, payrollRunId) {
  if (!hasPermission(actor, PERMISSIONS.PAYROLL_APPROVE)) throw new Error("Unauthorized payroll lock.");
  const run = data.payrollRuns.find((item) => item.id === payrollRunId);
  if (!run || run.status !== "approved") throw new Error("Only approved payroll can be locked.");
  const payrollRuns = data.payrollRuns.map((item) =>
    item.id === payrollRunId ? { ...item, status: "locked", lockedAt: nowIso(), updatedAt: nowIso() } : item
  );
  return addAudit({ ...data, payrollRuns }, actor, "Payroll locked", "PayrollRun", payrollRunId, run, { status: "locked" });
}

export function generatePayslips(data, actor, payrollRunId) {
  if (!hasPermission(actor, PERMISSIONS.PAYROLL_MANAGE)) throw new Error("Unauthorized payslip generation.");
  const run = data.payrollRuns.find((item) => item.id === payrollRunId);
  if (!run || !["approved", "locked", "published"].includes(run.status)) throw new Error("Payslips require approved payroll.");
  const rows = data.payrollRunEmployees.filter((item) => item.payrollRunId === payrollRunId);
  const existingKeys = new Set(data.payslips.map((item) => `${item.payrollRunId}:${item.employeeId}`));
  const payslips = rows
    .filter((row) => !existingKeys.has(`${payrollRunId}:${row.employeeId}`))
    .map((row) => ({
      id: uid("payslip"),
      payrollRunId,
      employeeId: row.employeeId,
      month: run.month,
      year: run.year,
      title: data.companySettings.payslipTitleFormat
        .replace("{MONTH}", monthName(run.month).toUpperCase())
        .replace("{YEAR}", String(run.year)),
      fileStorageKey: `payslips/${run.year}/${String(run.month).padStart(2, "0")}/${row.employeeId}.pdf`,
      status: "generated",
      generatedAt: nowIso(),
      publishedAt: "",
      netPay: row.netPay,
    }));
  return addAudit({ ...data, payslips: [...payslips, ...data.payslips] }, actor, "Payslip generated", "Payslip", payrollRunId, null, {
    payslips: payslips.length,
  });
}

export function publishPayslips(data, actor, payrollRunId) {
  if (!hasPermission(actor, PERMISSIONS.PAYROLL_MANAGE)) throw new Error("Unauthorized payslip publication.");
  const run = data.payrollRuns.find((item) => item.id === payrollRunId);
  if (!run || run.status !== "locked") throw new Error("Payslips can only be published after payroll is locked.");
  if (!data.payslips.some((item) => item.payrollRunId === payrollRunId)) throw new Error("Generate payslips before publishing.");
  const payrollRuns = data.payrollRuns.map((item) =>
    item.id === payrollRunId ? { ...item, status: "published", publishedAt: nowIso(), updatedAt: nowIso() } : item
  );
  const payslips = data.payslips.map((item) =>
    item.payrollRunId === payrollRunId ? { ...item, status: "published", publishedAt: nowIso() } : item
  );
  return addAudit({ ...data, payrollRuns, payslips }, actor, "Payslip published", "PayrollRun", payrollRunId, null, { status: "published" });
}

export function monthName(month) {
  return new Date(2026, month - 1, 1).toLocaleString("en-IN", { month: "long" });
}

export function amountInWordsINR(value) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`);
  const three = (n) => `${n > 99 ? `${ones[Math.floor(n / 100)]} Hundred ` : ""}${two(n % 100)}`.trim();
  let n = Math.round(Number(value || 0));
  if (n === 0) return "INR Zero Only";
  const parts = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${three(crore)} Crore`);
  if (lakh) parts.push(`${three(lakh)} Lakh`);
  if (thousand) parts.push(`${three(thousand)} Thousand`);
  if (n) parts.push(three(n));
  return `INR ${parts.join(" ")} Only`;
}

export function buildPayslipHtml(data, payslipId) {
  const payslip = data.payslips.find((item) => item.id === payslipId);
  const employee = data.employees.find((item) => item.id === payslip?.employeeId);
  const payroll = data.payrollRunEmployees.find((item) => item.payrollRunId === payslip?.payrollRunId && item.employeeId === payslip?.employeeId);
  if (!payslip || !employee || !payroll) return "";
  const department = data.departments.find((item) => item.id === employee.departmentId)?.name || "-";
  const designation = data.designations.find((item) => item.id === employee.designationId)?.name || "-";
  const earnings = payroll.componentItems.filter((item) => item.type === "earning");
  const deductions = [
    { name: "LOP", amount: payroll.lopDeduction },
    { name: "Advance", amount: payroll.advanceDeduction },
    { name: "Other Deductions", amount: payroll.otherDeductions },
  ].filter((item) => item.amount > 0 || item.name !== "Other Deductions");
  return `
    <article class="payslip-print">
      <h1>${payslip.title}</h1>
      <section class="company-block">
        <strong>${data.companySettings.companyName}</strong>
        <span>${data.companySettings.address.replace(/\n/g, "<br />")}</span>
      </section>
      <section class="payslip-grid">
        <div><b>Employee Name</b><span>${employee.fullName}</span></div>
        <div><b>Employee ID</b><span>${employee.employeeCode}</span></div>
        <div><b>Designation</b><span>${designation}</span></div>
        <div><b>Department</b><span>${department}</span></div>
        <div><b>Date of Joining</b><span>${formatDate(employee.joiningDate)}</span></div>
        <div><b>Salary Days</b><span>${payroll.salaryDays}</span></div>
        <div><b>Present Days</b><span>${payroll.presentDays}</span></div>
        <div><b>LOP Days</b><span>${payroll.lopDays}</span></div>
        <div><b>OT Days</b><span>${payroll.otDays}</span></div>
        <div><b>Bank Name</b><span>${employee.bankName}</span></div>
        <div><b>Bank A/c No</b><span>${maskBank(employee.bankAccountNumber)}</span></div>
        <div><b>IFSC Code</b><span>${employee.ifscCode}</span></div>
      </section>
      <section class="payslip-tables">
        <table><thead><tr><th>Earnings</th><th>Amount</th></tr></thead><tbody>${earnings
          .map((item) => `<tr><td>${item.name}</td><td>${formatINR(item.amount)}</td></tr>`)
          .join("")}</tbody></table>
        <table><thead><tr><th>Deductions</th><th>Amount</th></tr></thead><tbody>${deductions
          .map((item) => `<tr><td>${item.name}</td><td>${formatINR(item.amount)}</td></tr>`)
          .join("")}</tbody></table>
      </section>
      <section class="payslip-summary">
        <div><b>Gross Earned Salary</b><span>${formatINR(payroll.totalEarnings)}</span></div>
        <div><b>Total Deductions</b><span>${formatINR(payroll.totalDeductions)}</span></div>
        <div><b>Net Pay</b><span>${formatINR(payroll.netPay)}</span></div>
        <p>${amountInWordsINR(payroll.netPay)}</p>
      </section>
      <footer>${data.companySettings.payslipNote}<br />${data.companySettings.payslipFooter}</footer>
    </article>
  `;
}

function salaryItems(gross) {
  return [
    { salaryComponentId: "sc_basic", code: "BASIC", name: "Basic Salary", type: "earning", amount: gross * 0.4 },
    { salaryComponentId: "sc_hra", code: "HRA", name: "House Rent Allowances", type: "earning", amount: gross * 0.2 },
    { salaryComponentId: "sc_conv", code: "CONVEYANCE", name: "Conveyance Allowances", type: "earning", amount: gross * 0.1 },
    { salaryComponentId: "sc_medical", code: "MEDICAL", name: "Medical Allowances", type: "earning", amount: gross * 0.05 },
    { salaryComponentId: "sc_special", code: "SPECIAL", name: "Special Allowances", type: "earning", amount: gross * 0.25 },
    { salaryComponentId: "sc_ot", code: "OT", name: "Over Time Pay", type: "earning", amount: 0 },
  ];
}

export function seedAppData() {
  const users = [
    ["user_super", "superadmin@eaglercm.example", "Super Admin", ROLES.SUPER_ADMIN, "emp_001"],
    ["user_hr", "hr@eaglercm.example", "HR Admin", ROLES.HR_ADMIN, "emp_002"],
    ["user_payroll", "payroll@eaglercm.example", "Payroll Admin", ROLES.PAYROLL_ADMIN, "emp_003"],
    ["user_boss", "boss@eaglercm.example", "Boss Owner", ROLES.BOSS, "emp_004"],
    ["user_manager", "manager@eaglercm.example", "Team Manager", ROLES.MANAGER, "emp_005"],
    ["user_employee", "employee@eaglercm.example", "Sample Employee", ROLES.EMPLOYEE, "emp_006"],
  ].map(([id, email, name, role, employeeId]) => ({
    id,
    email,
    name,
    role,
    employeeId,
    passwordHash: hashPassword(DEFAULT_PASSWORD),
    forcePasswordReset: false,
    status: "ACTIVE",
    failedLoginAttempts: 0,
    lockedUntil: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }));
  const departments = [
    { id: "dept_ops", name: "Operations", code: "OPS", active: true },
    { id: "dept_ar", name: "Accounts Receivable", code: "AR", active: true },
    { id: "dept_coding", name: "Medical Coding", code: "COD", active: true },
    { id: "dept_hr", name: "Human Resources", code: "HR", active: true },
    { id: "dept_fin", name: "Finance", code: "FIN", active: true },
  ];
  const designations = [
    { id: "des_exec", name: "Billing Executive", departmentId: "dept_ops" },
    { id: "des_senior", name: "Senior AR Specialist", departmentId: "dept_ar" },
    { id: "des_coder", name: "Certified Coder", departmentId: "dept_coding" },
    { id: "des_hr", name: "HR Executive", departmentId: "dept_hr" },
    { id: "des_mgr", name: "Team Lead", departmentId: "dept_ops" },
    { id: "des_owner", name: "Owner", departmentId: "dept_fin" },
  ];
  const shifts = [
    {
      id: "shift_general",
      name: "General Shift",
      startTime: "09:30",
      endTime: "18:30",
      graceMinutes: 10,
      minimumFullDayHours: 8,
      minimumHalfDayHours: 4,
      weeklyOffs: ["Saturday", "Sunday"],
      active: true,
    },
    {
      id: "shift_evening",
      name: "US Evening Shift",
      startTime: "18:00",
      endTime: "03:00",
      graceMinutes: 15,
      minimumFullDayHours: 8,
      minimumHalfDayHours: 4,
      weeklyOffs: ["Saturday", "Sunday"],
      active: true,
    },
  ];
  const holidays = [
    { id: "hol_2026_01", name: "Republic Day", date: "2026-01-26" },
    { id: "hol_2026_08", name: "Independence Day", date: "2026-08-15" },
    { id: "hol_2026_10", name: "Diwali", date: "2026-11-08" },
  ];
  const leaveTypes = [
    { id: "lt_cl", name: "Casual Leave", code: "CL", paid: true, monthlyAccrual: 1, yearlyAccrual: 12, carryForwardAllowed: true, carryForwardLimit: 6, maxBalance: 18, allowNegativeBalance: false, requiresApproval: true, halfDayAllowed: true, documentRequired: false, countsTowardLop: false, active: true },
    { id: "lt_sl", name: "Sick Leave", code: "SL", paid: true, monthlyAccrual: 0.5, yearlyAccrual: 6, carryForwardAllowed: false, carryForwardLimit: 0, maxBalance: 6, allowNegativeBalance: false, requiresApproval: true, halfDayAllowed: true, documentRequired: false, countsTowardLop: false, active: true },
    { id: "lt_lop", name: "Unpaid Leave / LOP", code: "LOP", paid: false, monthlyAccrual: 0, yearlyAccrual: 0, carryForwardAllowed: false, carryForwardLimit: 0, maxBalance: 0, allowNegativeBalance: true, requiresApproval: true, halfDayAllowed: true, documentRequired: false, countsTowardLop: true, active: true },
    { id: "lt_co", name: "Comp Off", code: "CO", paid: true, monthlyAccrual: 0, yearlyAccrual: 0, carryForwardAllowed: true, carryForwardLimit: 4, maxBalance: 8, allowNegativeBalance: false, requiresApproval: true, halfDayAllowed: true, documentRequired: false, countsTowardLop: false, active: true },
  ];
  const employees = [
    ["emp_001", "ERCM0001", "Aarav", "Raman", "dept_fin", "des_owner", "", ROLES.SUPER_ADMIN, 150000],
    ["emp_002", "ERCM0002", "Meera", "Krishnan", "dept_hr", "des_hr", "emp_004", ROLES.HR_ADMIN, 85000],
    ["emp_003", "ERCM0003", "Nikhil", "Iyer", "dept_fin", "des_senior", "emp_004", ROLES.PAYROLL_ADMIN, 90000],
    ["emp_004", "ERCM0004", "Priya", "Menon", "dept_fin", "des_owner", "", ROLES.BOSS, 180000],
    ["emp_005", "ERCM0005", "Sanjay", "Rao", "dept_ops", "des_mgr", "emp_004", ROLES.MANAGER, 95000],
    ["emp_006", "ERCM0006", "Kavya", "Srinivasan", "dept_ops", "des_exec", "emp_005", ROLES.EMPLOYEE, 60000],
    ["emp_007", "ERCM0007", "Rohan", "Das", "dept_ar", "des_senior", "emp_005", ROLES.EMPLOYEE, 62000],
    ["emp_008", "ERCM0008", "Ananya", "Shah", "dept_coding", "des_coder", "emp_005", ROLES.EMPLOYEE, 68000],
    ["emp_009", "ERCM0009", "Farhan", "Ali", "dept_ops", "des_exec", "emp_005", ROLES.EMPLOYEE, 54000],
    ["emp_010", "ERCM0010", "Divya", "Nair", "dept_ar", "des_exec", "emp_005", ROLES.EMPLOYEE, 58000],
    ["emp_011", "ERCM0011", "Vikram", "Bose", "dept_coding", "des_coder", "emp_005", ROLES.EMPLOYEE, 70000],
    ["emp_012", "ERCM0012", "Lakshmi", "Narayan", "dept_ops", "des_exec", "emp_005", ROLES.EMPLOYEE, 56000],
  ].map(([id, employeeCode, firstName, lastName, departmentId, designationId, managerId, role, gross], index) => ({
    id,
    employeeCode,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@eaglercm.example`,
    phone: `+91 90000 10${String(index).padStart(2, "0")}`,
    dateOfBirth: `199${index % 10}-0${(index % 8) + 1}-15`,
    gender: index % 2 ? "Female" : "Male",
    address: `${index + 10}, Sample Street, Chennai, Tamil Nadu`,
    emergencyContactName: "Dummy Contact",
    emergencyContactPhone: `+91 98888 00${String(index).padStart(2, "0")}`,
    departmentId,
    designationId,
    managerId,
    joiningDate: `202${index % 4}-0${(index % 8) + 1}-01`,
    status: "active",
    workLocation: "Chromepet, Chennai",
    shiftId: index % 4 === 0 ? "shift_evening" : "shift_general",
    leavePolicyId: "policy_standard",
    salaryStructureId: `salary_${id}`,
    bankName: "HDFC Bank",
    bankAccountNumber: `5010020000${String(index + 1000)}`,
    ifscCode: "HDFC0001234",
    pan: `ABCDE${1000 + index}F`,
    aadhaar: `99998888777${index}`,
    role,
    grossMonthlySalary: gross,
    createdBy: "user_super",
    updatedBy: "user_super",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }));
  const salaryComponents = [
    { id: "sc_basic", name: "Basic Salary", code: "BASIC", type: "earning", calculationType: "percentage", percentageBase: "gross", defaultAmount: 40, displayOnPayslip: true, taxable: true, recurring: true, sortOrder: 1, active: true },
    { id: "sc_hra", name: "House Rent Allowances", code: "HRA", type: "earning", calculationType: "percentage", percentageBase: "gross", defaultAmount: 20, displayOnPayslip: true, taxable: true, recurring: true, sortOrder: 2, active: true },
    { id: "sc_conv", name: "Conveyance Allowances", code: "CONVEYANCE", type: "earning", calculationType: "percentage", percentageBase: "gross", defaultAmount: 10, displayOnPayslip: true, taxable: true, recurring: true, sortOrder: 3, active: true },
    { id: "sc_medical", name: "Medical Allowances", code: "MEDICAL", type: "earning", calculationType: "percentage", percentageBase: "gross", defaultAmount: 5, displayOnPayslip: true, taxable: true, recurring: true, sortOrder: 4, active: true },
    { id: "sc_special", name: "Special Allowances", code: "SPECIAL", type: "earning", calculationType: "percentage", percentageBase: "gross", defaultAmount: 25, displayOnPayslip: true, taxable: true, recurring: true, sortOrder: 5, active: true },
    { id: "sc_ot", name: "Over Time Pay", code: "OT", type: "earning", calculationType: "variable", percentageBase: "", defaultAmount: 0, displayOnPayslip: true, taxable: true, recurring: false, sortOrder: 6, active: true },
    { id: "sc_lop", name: "LOP", code: "LOP", type: "deduction", calculationType: "formula", percentageBase: "gross", defaultAmount: 0, displayOnPayslip: true, taxable: false, recurring: false, sortOrder: 20, active: true },
    { id: "sc_advance", name: "Advance", code: "ADVANCE", type: "deduction", calculationType: "variable", percentageBase: "", defaultAmount: 0, displayOnPayslip: true, taxable: false, recurring: false, sortOrder: 21, active: true },
  ];
  const salaryStructures = employees.map((employee) => ({
    id: `salary_${employee.id}`,
    employeeId: employee.id,
    grossMonthlySalary: employee.grossMonthlySalary,
    items: salaryItems(employee.grossMonthlySalary),
    effectiveFrom: employee.joiningDate,
    effectiveTo: "",
    status: "active",
    createdBy: "user_super",
    approvedBy: "user_boss",
    revision: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }));
  const leaveLedgers = employees.flatMap((employee) => [
    { id: uid("ledger"), employeeId: employee.id, leaveTypeId: "lt_cl", source: "opening_balance", referenceId: "2026", days: 6, note: "Opening CL balance", createdAt: nowIso() },
    { id: uid("ledger"), employeeId: employee.id, leaveTypeId: "lt_sl", source: "opening_balance", referenceId: "2026", days: 3, note: "Opening SL balance", createdAt: nowIso() },
    { id: uid("ledger"), employeeId: employee.id, leaveTypeId: "lt_co", source: "manual_credit", referenceId: "seed", days: employee.id === "emp_006" ? 1 : 0, note: "Seed comp off credit", createdAt: nowIso() },
  ]);
  const attendanceRecords = employees.slice(5).flatMap((employee, idx) =>
    Array.from({ length: 12 }).map((_, day) => {
      const date = `2026-06-${String(day + 1).padStart(2, "0")}`;
      const half = idx === 0 && day === 5;
      return {
        id: `att_${employee.id}_${day}`,
        employeeId: employee.id,
        date,
        checkInAt: `${date}T04:00:00.000Z`,
        checkOutAt: `${date}T${half ? "08" : "13"}:00:00.000Z`,
        totalWorkedHours: half ? 4 : 9,
        status: half ? "Half Day" : "Present",
        shiftId: employee.shiftId,
        late: false,
        earlyExit: half,
        halfDay: half,
        source: "web",
        ipAddress: "captured-server-side",
        userAgent: "captured-server-side",
        editedBy: "",
        editReason: "",
        approvalStatus: "approved",
        locked: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
    })
  );
  const leaveRequests = [
    {
      id: "leave_seed_approved",
      employeeId: "emp_006",
      leaveTypeId: "lt_cl",
      startDate: "2026-06-13",
      endDate: "2026-06-13",
      days: 1,
      halfDay: false,
      reason: "Personal work",
      documentFileId: "",
      status: "approved",
      lopDays: 0,
      approvalHistory: [{ approverId: "user_manager", approverRole: ROLES.MANAGER, status: "approved", remarks: "Approved", timestamp: nowIso() }],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    {
      id: "leave_seed_pending",
      employeeId: "emp_007",
      leaveTypeId: "lt_sl",
      startDate: "2026-06-18",
      endDate: "2026-06-18",
      days: 1,
      halfDay: false,
      reason: "Fever",
      documentFileId: "",
      status: "pending",
      lopDays: 0,
      approvalHistory: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ];
  return {
    companySettings: DEFAULT_COMPANY,
    users,
    employees,
    departments,
    designations,
    shifts,
    holidays,
    leaveTypes,
    leavePolicies: [
      {
        id: "policy_standard",
        name: "Standard Eagle RCM Leave Policy",
        active: true,
        approvalFlow: ["manager", "hr"],
        rules: leaveTypes.map((type) => ({ leaveTypeId: type.id, monthlyAccrual: type.monthlyAccrual, maxBalance: type.maxBalance })),
      },
    ],
    leaveLedgers: [
      { id: uid("ledger"), employeeId: "emp_006", leaveTypeId: "lt_cl", source: "leave_approval", referenceId: "leave_seed_approved", days: -1, note: "Approved CL", createdAt: nowIso() },
      ...leaveLedgers,
    ],
    leaveRequests,
    attendanceRecords,
    attendanceCorrections: [
      {
        id: "correction_seed",
        employeeId: "emp_008",
        attendanceRecordId: "",
        date: "2026-06-14",
        requestedCheckInAt: "2026-06-14T04:00:00.000Z",
        requestedCheckOutAt: "2026-06-14T13:00:00.000Z",
        reason: "Forgot to punch after system restart",
        status: "pending",
        approverId: "",
        remarks: "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    ],
    salaryComponents,
    salaryStructures,
    payrollAdjustments: [
      { id: "adj_advance", employeeId: "emp_006", year: 2026, month: 6, componentCode: "ADVANCE", type: "deduction", amount: 0, units: 0, remarks: "No advance" },
      { id: "adj_ot", employeeId: "emp_006", year: 2026, month: 6, componentCode: "OT", type: "earning", amount: 0, units: 0, remarks: "No OT" },
    ],
    payrollRuns: [],
    payrollRunEmployees: [],
    payslips: [],
    notifications: [
      { id: "note_1", userId: "user_employee", title: "Payslip portal ready", body: "June payroll will appear after publication.", read: false, createdAt: nowIso() },
      { id: "note_2", userId: "user_manager", title: "Pending leave approval", body: "One team leave request is waiting.", read: false, createdAt: nowIso() },
    ],
    uploadedFiles: [],
    auditLogs: [
      {
        id: "audit_seed",
        actorUserId: "system",
        actorRole: "SYSTEM",
        action: "Seeded Eagle RCM workspace",
        entityType: "Workspace",
        entityId: "seed",
        previousValue: null,
        newValue: null,
        ipAddress: "",
        userAgent: "",
        timestamp: nowIso(),
      },
    ],
  };
}
