import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  DEFAULT_PASSWORD,
  PERMISSIONS,
  ROLE_LABELS,
  ROLES,
  amountInWordsINR,
  applyLeave,
  approveAttendanceCorrection,
  approveLeaveRequest,
  approvePayrollRun,
  authenticateUser,
  buildPayslipHtml,
  canAccessEmployee,
  canAccessPayslip,
  checkIn,
  checkOut,
  createPayrollRun,
  formatDate,
  formatINR,
  generatePayslips,
  getLeaveBalance,
  hasPermission,
  lockPayrollRun,
  maskBank,
  monthName,
  publishPayslips,
  rejectLeaveRequest,
  seedAppData,
} from "./hrCore.js";

const STORAGE_KEY = "eagle_rcm_hr_portal_v1";
const SESSION_KEY = "eagle_rcm_session_user";

const GLASSMORPHISM_THEME = {
  themeName: "Glassmorphism HR Portal",
  themeId: "glassmorphism_hr_portal",
  primaryColor: "#4F46E5",
  secondaryColor: "#7C3AED",
  accentColor: "#06B6D4",
};

function normalizeData(data) {
  return {
    ...data,
    companySettings: {
      ...data.companySettings,
      selectedTheme: data.companySettings?.selectedTheme || GLASSMORPHISM_THEME.themeId,
      themeName: data.companySettings?.themeName || GLASSMORPHISM_THEME.themeName,
      primaryColor: data.companySettings?.primaryColor || data.companySettings?.themeColor || GLASSMORPHISM_THEME.primaryColor,
      secondaryColor: data.companySettings?.secondaryColor || GLASSMORPHISM_THEME.secondaryColor,
      accentColor: data.companySettings?.accentColor || GLASSMORPHISM_THEME.accentColor,
    },
  };
}

function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return normalizeData(stored ? JSON.parse(stored) : seedAppData());
  } catch {
    return normalizeData(seedAppData());
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

async function apiJson(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `Request failed: ${response.status}`);
  return payload;
}

function themeStyle(settings = {}) {
  return {
    "--color-primary": settings.primaryColor || GLASSMORPHISM_THEME.primaryColor,
    "--color-secondary": settings.secondaryColor || GLASSMORPHISM_THEME.secondaryColor,
    "--color-accent": settings.accentColor || GLASSMORPHISM_THEME.accentColor,
  };
}

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function downloadCsv(filename, rows) {
  const headers = Object.keys(rows[0] || { empty: "" });
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadXlsx(filename, rows, sheetName) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Badge({ children, tone = "neutral" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Metric({ label, value, tone }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={tone || ""}>{value}</strong>
    </div>
  );
}

function VaultAccess() {
  const [data, setDataState] = useState(loadData);
  const [sessionUserId, setSessionUserId] = useState(() => localStorage.getItem(SESSION_KEY) || "");
  const [view, setView] = useState("dashboard");
  const [toast, setToast] = useState("");
  const [login, setLogin] = useState({ email: "superadmin@eaglercm.example", password: DEFAULT_PASSWORD });
  const [authError, setAuthError] = useState("");
  const [employeeDraft, setEmployeeDraft] = useState({
    firstName: "",
    lastName: "",
    email: "",
    departmentId: "dept_ops",
    designationId: "des_exec",
    managerId: "emp_005",
    grossMonthlySalary: 60000,
  });
  const [leaveDraft, setLeaveDraft] = useState({
    leaveTypeId: "lt_cl",
    startDate: "2026-07-10",
    endDate: "2026-07-10",
    days: 1,
    reason: "",
  });
  const [correctionDraft, setCorrectionDraft] = useState({
    date: "2026-07-01",
    requestedCheckInAt: "2026-07-01T04:00:00.000Z",
    requestedCheckOutAt: "2026-07-01T13:00:00.000Z",
    reason: "",
  });
  const [payrollDraft, setPayrollDraft] = useState({ month: 6, year: 2026 });
  const [selectedPayslipId, setSelectedPayslipId] = useState("");
  const [settingsDraft, setSettingsDraft] = useState(data.companySettings);
  const [filters, setFilters] = useState({ department: "all", status: "all", query: "" });
  const [csrfToken, setCsrfToken] = useState("");
  const [serverBacked, setServerBacked] = useState(false);
  const [booting, setBooting] = useState(true);

  const currentUser = data.users.find((user) => user.id === sessionUserId) || null;
  const currentEmployee = data.employees.find((employee) => employee.id === currentUser?.employeeId) || null;
  const visibleEmployees = useMemo(() => {
    if (!currentUser) return [];
    return data.employees
      .filter((employee) => canAccessEmployee(currentUser, employee, data.employees))
      .filter((employee) => filters.department === "all" || employee.departmentId === filters.department)
      .filter((employee) => filters.status === "all" || employee.status === filters.status)
      .filter((employee) => {
        const q = filters.query.trim().toLowerCase();
        return !q || [employee.fullName, employee.employeeCode, employee.email].some((value) => value.toLowerCase().includes(q));
      });
  }, [currentUser, data.employees, filters]);

  const teamEmployeeIds = data.employees.filter((employee) => employee.managerId === currentEmployee?.id).map((employee) => employee.id);
  const pendingLeave = data.leaveRequests.filter((request) => request.status === "pending");
  const pendingCorrections = data.attendanceCorrections.filter((request) => request.status === "pending");
  const currentPayroll = data.payrollRuns[0];
  const selectedPayslip = data.payslips.find((payslip) => payslip.id === selectedPayslipId) || data.payslips[0];

  useEffect(() => {
    let active = true;
    async function boot() {
      try {
        const me = await apiJson("/api/auth/me");
        const state = await apiJson("/api/state", { headers: { "x-csrf-token": me.csrfToken } });
        if (!active) return;
        setServerBacked(true);
        setCsrfToken(state.csrfToken || me.csrfToken || "");
        setDataState(normalizeData(state.data));
        setSettingsDraft(normalizeData(state.data).companySettings);
        if (me.user?.id) {
          setSessionUserId(me.user.id);
          localStorage.setItem(SESSION_KEY, me.user.id);
        }
      } catch {
        setServerBacked(false);
      } finally {
        if (active) setBooting(false);
      }
    }
    boot();
    return () => {
      active = false;
    };
  }, []);

  function setData(next) {
    setDataState(next);
    saveData(next);
    if (serverBacked && csrfToken) {
      apiJson("/api/state", {
        method: "PUT",
        headers: { "x-csrf-token": csrfToken },
        body: JSON.stringify({ data: next }),
      })
        .then((payload) => {
          if (payload.csrfToken) setCsrfToken(payload.csrfToken);
        })
        .catch((error) => notify(error.message));
    }
  }

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function runAction(action, success) {
    try {
      const next = action(data);
      setData(next);
      notify(success);
    } catch (error) {
      notify(error.message);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    try {
      const result = await apiJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: login.email, password: login.password }),
      });
      const state = await apiJson("/api/state", { headers: { "x-csrf-token": result.csrfToken } });
      setServerBacked(true);
      setCsrfToken(state.csrfToken || result.csrfToken || "");
      setDataState(normalizeData(state.data));
      setSettingsDraft(normalizeData(state.data).companySettings);
      setSessionUserId(result.user.id);
      localStorage.setItem(SESSION_KEY, result.user.id);
      setAuthError("");
      setView("dashboard");
      notify("Signed in securely.");
      return;
    } catch {
      setServerBacked(false);
    }
    const result = authenticateUser(data.users, login.email, login.password);
    if (!result.ok) {
      setAuthError(result.reason);
      return;
    }
    const users = data.users.map((user) => (user.id === result.user.id ? result.user : user));
    setData({ ...data, users });
    setSessionUserId(result.user.id);
    localStorage.setItem(SESSION_KEY, result.user.id);
    setAuthError("");
    setView("dashboard");
    notify("Signed in.");
  }

  async function logout() {
    if (serverBacked && csrfToken) {
      await apiJson("/api/auth/logout", { method: "POST", headers: { "x-csrf-token": csrfToken } }).catch(() => {});
    }
    setSessionUserId("");
    setCsrfToken("");
    localStorage.removeItem(SESSION_KEY);
    setView("dashboard");
  }

  function createEmployee(event) {
    event.preventDefault();
    if (!hasPermission(currentUser, PERMISSIONS.EMPLOYEE_MANAGE)) return notify("You are not allowed to create employees.");
    const nextNumber = data.employees.length + 1;
    const id = `emp_${String(Date.now()).slice(-8)}`;
    const fullName = `${employeeDraft.firstName} ${employeeDraft.lastName}`.trim();
    const employee = {
      id,
      employeeCode: `${data.companySettings.employeeCodePrefix}${String(nextNumber).padStart(4, "0")}`,
      firstName: employeeDraft.firstName,
      lastName: employeeDraft.lastName,
      fullName,
      email: employeeDraft.email,
      phone: "+91 90000 00000",
      dateOfBirth: "1995-01-01",
      gender: "Not specified",
      address: "Chennai, Tamil Nadu",
      emergencyContactName: "Emergency Contact",
      emergencyContactPhone: "+91 98888 00000",
      departmentId: employeeDraft.departmentId,
      designationId: employeeDraft.designationId,
      managerId: employeeDraft.managerId,
      joiningDate: new Date().toISOString().slice(0, 10),
      status: "active",
      workLocation: "Chromepet, Chennai",
      shiftId: "shift_general",
      leavePolicyId: "policy_standard",
      salaryStructureId: `salary_${id}`,
      bankName: "Pending",
      bankAccountNumber: "0000000000",
      ifscCode: "PENDING0000",
      pan: "",
      aadhaar: "",
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const gross = Number(employeeDraft.grossMonthlySalary || 0);
    const salaryStructure = {
      id: `salary_${id}`,
      employeeId: id,
      grossMonthlySalary: gross,
      items: [
        { salaryComponentId: "sc_basic", code: "BASIC", name: "Basic Salary", type: "earning", amount: gross * 0.4 },
        { salaryComponentId: "sc_hra", code: "HRA", name: "House Rent Allowances", type: "earning", amount: gross * 0.2 },
        { salaryComponentId: "sc_conv", code: "CONVEYANCE", name: "Conveyance Allowances", type: "earning", amount: gross * 0.1 },
        { salaryComponentId: "sc_medical", code: "MEDICAL", name: "Medical Allowances", type: "earning", amount: gross * 0.05 },
        { salaryComponentId: "sc_special", code: "SPECIAL", name: "Special Allowances", type: "earning", amount: gross * 0.25 },
        { salaryComponentId: "sc_ot", code: "OT", name: "Over Time Pay", type: "earning", amount: 0 },
      ],
      effectiveFrom: employee.joiningDate,
      effectiveTo: "",
      status: "active",
      createdBy: currentUser.id,
      approvedBy: "",
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const audit = {
      id: `audit_${Date.now()}`,
      actorUserId: currentUser.id,
      actorRole: currentUser.role,
      action: "Employee created",
      entityType: "Employee",
      entityId: employee.id,
      previousValue: null,
      newValue: { employeeCode: employee.employeeCode, fullName },
      ipAddress: "captured-server-side",
      userAgent: "captured-server-side",
      timestamp: new Date().toISOString(),
    };
    setData({
      ...data,
      employees: [employee, ...data.employees],
      salaryStructures: [salaryStructure, ...data.salaryStructures],
      auditLogs: [audit, ...data.auditLogs],
    });
    setEmployeeDraft({ ...employeeDraft, firstName: "", lastName: "", email: "" });
    notify("Employee created.");
  }

  function exportRows(type, xlsx = false) {
    const rows = buildReportRows(type);
    const safeCompany = data.companySettings.companyName.replace(/\s+/g, "_");
    const filename = `${safeCompany}_${type}_${new Date().toISOString().slice(0, 10)}.${xlsx ? "xlsx" : "csv"}`;
    if (xlsx) downloadXlsx(filename, rows, type.slice(0, 28));
    else downloadCsv(filename, rows);
    notify(`${type} exported.`);
  }

  function buildReportRows(type) {
    if (type === "employee_master") {
      return visibleEmployees.map((employee) => ({
        "Employee ID": employee.employeeCode,
        Name: employee.fullName,
        Email: employee.email,
        Department: data.departments.find((item) => item.id === employee.departmentId)?.name,
        Designation: data.designations.find((item) => item.id === employee.designationId)?.name,
        Manager: data.employees.find((item) => item.id === employee.managerId)?.fullName || "-",
        Status: employee.status,
        "Bank Account": maskBank(employee.bankAccountNumber),
      }));
    }
    if (type === "payroll_ready") {
      return data.payrollRunEmployees.map((row) => {
        const employee = data.employees.find((item) => item.id === row.employeeId);
        return {
          "Employee ID": employee?.employeeCode,
          "Employee Name": row.employeeName,
          "Payroll Month": `${monthName(row.payrollMonth)} ${row.payrollYear}`,
          "Calendar Days": row.calendarDays,
          "Present Days": row.presentDays,
          "Paid Leave Days": row.paidLeaveDays,
          "LOP Days": row.lopDays,
          "Payable Days": row.payableDays,
          "Gross Monthly Salary": row.grossMonthlySalary,
          "Gross Earnings": row.totalEarnings,
          "LOP Deduction": row.lopDeduction,
          "Advance Deduction": row.advanceDeduction,
          "Total Deductions": row.totalDeductions,
          "Net Pay": row.netPay,
          "Bank Name": employee?.bankName,
          "Masked Bank Account Number": maskBank(employee?.bankAccountNumber),
          "IFSC Code": employee?.ifscCode,
          "Payroll Status": row.status,
          Remarks: row.remarks,
        };
      });
    }
    if (type === "leave_balance") {
      return data.employees.flatMap((employee) =>
        data.leaveTypes.map((typeItem) => ({
          "Employee ID": employee.employeeCode,
          Name: employee.fullName,
          "Leave Type": typeItem.name,
          Balance: getLeaveBalance(data, employee.id, typeItem.id),
        }))
      );
    }
    return data.attendanceRecords.map((record) => {
      const employee = data.employees.find((item) => item.id === record.employeeId);
      return {
        Date: record.date,
        "Employee ID": employee?.employeeCode,
        Name: employee?.fullName,
        Status: record.status,
        "Check In": record.checkInAt,
        "Check Out": record.checkOutAt,
        Hours: record.totalWorkedHours,
      };
    });
  }

  function printPayslip(payslipId) {
    const html = buildPayslipHtml(data, payslipId);
    const popup = window.open("", "_blank", "width=900,height=1100");
    const payslipTheme = `:root { --color-primary: ${data.companySettings.primaryColor || GLASSMORPHISM_THEME.primaryColor}; }`;
    popup.document.write(`
      <html>
        <head>
          <title>Payslip</title>
          <style>${payslipTheme}${printStyles}</style>
        </head>
        <body>${html}<script>window.print()</script></body>
      </html>
    `);
    popup.document.close();
  }

  if (!currentUser) {
    return (
      <main className="login-shell glass-theme" style={themeStyle(data.companySettings)}>
        <style>{styles}</style>
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <div className="ambient ambient-three" />
        <section className="login-hero">
          <div className="brand-tile">ER</div>
          <h1>Employee Self Service Portal</h1>
          <p>Secure access to attendance, leave, payroll, and payslips</p>
          <div className="login-notes">
            <strong>Seeded access</strong>
            <span>superadmin@eaglercm.example / {DEFAULT_PASSWORD}</span>
            <span>hr@eaglercm.example, payroll@eaglercm.example, boss@eaglercm.example, manager@eaglercm.example, employee@eaglercm.example</span>
          </div>
        </section>
        <form className="login-card" onSubmit={handleLogin}>
          <h2>Secure login</h2>
          <Field label="Email">
            <input value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} />
          </Field>
          <Field label="Password">
            <input type="password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} />
          </Field>
          {authError && <div className="error">{authError}</div>}
          <button className="primary">Log in</button>
          <button type="button" className="ghost" onClick={() => notify("Reset-password flow is ready for SMTP integration.")}>
            Forgot password
          </button>
        </form>
        {toast && <div className="toast">{toast}</div>}
      </main>
    );
  }

  const navItems = [
    ["dashboard", "Dashboard", true],
    ["employees", "Employees", hasPermission(currentUser, PERMISSIONS.EMPLOYEE_READ_ALL) || currentUser.role === ROLES.MANAGER || currentUser.role === ROLES.EMPLOYEE],
    ["attendance", "Attendance", hasPermission(currentUser, PERMISSIONS.ATTENDANCE_SELF) || hasPermission(currentUser, PERMISSIONS.ATTENDANCE_MANAGE)],
    ["leave", "Leave", hasPermission(currentUser, PERMISSIONS.LEAVE_SELF) || hasPermission(currentUser, PERMISSIONS.LEAVE_APPROVE)],
    ["payroll", "Payroll", hasPermission(currentUser, PERMISSIONS.PAYROLL_MANAGE) || hasPermission(currentUser, PERMISSIONS.PAYROLL_APPROVE)],
    ["payslips", "Payslips", hasPermission(currentUser, PERMISSIONS.PAYSLIP_READ_OWN) || hasPermission(currentUser, PERMISSIONS.PAYSLIP_READ_ALL)],
    ["reports", "Reports", hasPermission(currentUser, PERMISSIONS.REPORTS_HR) || hasPermission(currentUser, PERMISSIONS.REPORTS_PAYROLL)],
    ["settings", "Settings", hasPermission(currentUser, PERMISSIONS.SETTINGS_MANAGE) || hasPermission(currentUser, PERMISSIONS.EMPLOYEE_MANAGE)],
    ["audit", "Audit", hasPermission(currentUser, PERMISSIONS.AUDIT_READ)],
  ].filter((item) => item[2]);

  return (
    <div className="app-shell glass-theme" style={themeStyle(data.companySettings)}>
      <style>{styles}</style>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="ambient ambient-three" />
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("dashboard")}>
          <span>ER</span>
          <strong>{data.companySettings.companyName}</strong>
        </button>
        <nav>
          {navItems.map(([id, label]) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{navItems.find(([id]) => id === view)?.[1] || "Dashboard"}</h1>
            <p>{ROLE_LABELS[currentUser.role]} · {currentEmployee?.fullName}</p>
          </div>
          <div className="user-chip">
            <span>{initials(currentUser.name)}</span>
            <button className="ghost" onClick={logout}>Logout</button>
          </div>
        </header>
        {view === "dashboard" && <Dashboard data={data} currentUser={currentUser} currentEmployee={currentEmployee} setView={setView} />}
        {view === "employees" && (
          <Employees
            data={data}
            currentUser={currentUser}
            visibleEmployees={visibleEmployees}
            filters={filters}
            setFilters={setFilters}
            draft={employeeDraft}
            setDraft={setEmployeeDraft}
            onCreate={createEmployee}
            onExport={() => exportRows("employee_master")}
          />
        )}
        {view === "attendance" && (
          <Attendance
            data={data}
            currentUser={currentUser}
            currentEmployee={currentEmployee}
            correctionDraft={correctionDraft}
            setCorrectionDraft={setCorrectionDraft}
            onCheckIn={() => runAction((next) => checkIn(next, currentUser, new Date()), "Checked in.")}
            onCheckOut={() => runAction((next) => checkOut(next, currentUser, new Date()), "Checked out.")}
            onCorrection={(event) => {
              event.preventDefault();
              runAction((next) => {
                const request = {
                  id: `correction_${Date.now()}`,
                  employeeId: currentUser.employeeId,
                  attendanceRecordId: "",
                  ...correctionDraft,
                  status: "pending",
                  approverId: "",
                  remarks: "",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
                return { ...next, attendanceCorrections: [request, ...next.attendanceCorrections] };
              }, "Correction request submitted.");
            }}
            onApproveCorrection={(id) => runAction((next) => approveAttendanceCorrection(next, currentUser, id), "Correction approved.")}
            onExport={() => exportRows("attendance")}
          />
        )}
        {view === "leave" && (
          <Leave
            data={data}
            currentUser={currentUser}
            currentEmployee={currentEmployee}
            draft={leaveDraft}
            setDraft={setLeaveDraft}
            onApply={(event) => {
              event.preventDefault();
              runAction((next) => applyLeave(next, currentUser, leaveDraft), "Leave request submitted.");
            }}
            onApprove={(id) => runAction((next) => approveLeaveRequest(next, currentUser, id), "Leave approved.")}
            onReject={(id) => runAction((next) => rejectLeaveRequest(next, currentUser, id), "Leave rejected.")}
            onExport={() => exportRows("leave_balance")}
          />
        )}
        {view === "payroll" && (
          <Payroll
            data={data}
            currentUser={currentUser}
            draft={payrollDraft}
            setDraft={setPayrollDraft}
            onCreate={() => runAction((next) => createPayrollRun(next, currentUser, Number(payrollDraft.year), Number(payrollDraft.month)), "Payroll calculated.")}
            onApprove={(id) => runAction((next) => approvePayrollRun(next, currentUser, id), "Payroll approved.")}
            onLock={(id) => runAction((next) => lockPayrollRun(next, currentUser, id), "Payroll locked.")}
            onGenerate={(id) => runAction((next) => generatePayslips(next, currentUser, id), "Payslips generated.")}
            onPublish={(id) => runAction((next) => publishPayslips(next, currentUser, id), "Payslips published.")}
          />
        )}
        {view === "payslips" && (
          <Payslips
            data={data}
            currentUser={currentUser}
            selectedPayslip={selectedPayslip}
            setSelectedPayslipId={setSelectedPayslipId}
            onPrint={printPayslip}
          />
        )}
        {view === "reports" && <Reports onExport={exportRows} currentUser={currentUser} />}
        {view === "settings" && (
          <Settings
            data={data}
            currentUser={currentUser}
            draft={settingsDraft}
            setDraft={setSettingsDraft}
            onSave={(event) => {
              event.preventDefault();
              setData({ ...data, companySettings: settingsDraft });
              notify("Company settings saved.");
            }}
          />
        )}
        {view === "audit" && <Audit data={data} />}
      </section>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Dashboard({ data, currentUser, currentEmployee, setView }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayRecords = data.attendanceRecords.filter((record) => record.date === today);
  const ownToday = todayRecords.find((record) => record.employeeId === currentUser.employeeId);
  const teamIds = data.employees.filter((employee) => employee.managerId === currentEmployee?.id).map((employee) => employee.id);
  const pendingTeamLeave = data.leaveRequests.filter((request) => request.status === "pending" && teamIds.includes(request.employeeId)).length;
  const payroll = data.payrollRuns[0];
  return (
    <div className="stack">
      <section className="metrics">
        <Metric label="Total employees" value={data.employees.filter((employee) => employee.status === "active").length} />
        <Metric label="Present today" value={todayRecords.filter((record) => record.status === "Present").length} tone="good" />
        <Metric label="Pending leave" value={data.leaveRequests.filter((request) => request.status === "pending").length} tone="warn" />
        <Metric label="Payroll status" value={payroll?.status || "Not created"} />
      </section>
      <section className="grid two">
        <div className="panel">
          <h2>My workspace</h2>
          <div className="summary-list">
            <Info label="Today attendance" value={ownToday ? `${ownToday.status}, ${ownToday.totalWorkedHours} hours` : "Not marked"} />
            <Info label="Latest payslip" value={data.payslips.find((item) => item.employeeId === currentUser.employeeId)?.status || "Not published"} />
            <Info label="Manager pending approvals" value={pendingTeamLeave} />
          </div>
          <div className="actions">
            <button className="primary" onClick={() => setView("attendance")}>Open attendance</button>
            <button className="secondary" onClick={() => setView("leave")}>Open leave</button>
            <button className="secondary" onClick={() => setView("payslips")}>Open payslips</button>
          </div>
        </div>
        <div className="panel">
          <h2>Management snapshot</h2>
          <div className="summary-list">
            <Info label="Payroll net total" value={formatINR(payroll?.netTotal || 0)} />
            <Info label="Missing punch requests" value={data.attendanceCorrections.filter((item) => item.status === "pending").length} />
            <Info label="Audit entries" value={data.auditLogs.length} />
          </div>
        </div>
      </section>
      <section className="panel">
        <h2>Notifications</h2>
        <div className="cards">
          {data.notifications
            .filter((note) => note.userId === currentUser.id || currentUser.role !== ROLES.EMPLOYEE)
            .slice(0, 6)
            .map((note) => (
              <div className="mini-card" key={note.id}>
                <strong>{note.title}</strong>
                <span>{note.body}</span>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}

function Employees({ data, currentUser, visibleEmployees, filters, setFilters, draft, setDraft, onCreate, onExport }) {
  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Employee master</h2>
          <button className="secondary" onClick={onExport}>Export CSV</button>
        </div>
        <div className="filters">
          <input placeholder="Search employee" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} />
          <select value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}>
            <option value="all">All departments</option>
            {data.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </select>
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="resigned">Resigned</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>
        <div className="table">
          <div className="tr th"><span>ID</span><span>Name</span><span>Department</span><span>Manager</span><span>Bank</span><span>Status</span></div>
          {visibleEmployees.map((employee) => (
            <div className="tr" key={employee.id}>
              <span>{employee.employeeCode}</span>
              <span><strong>{employee.fullName}</strong><small>{employee.email}</small></span>
              <span>{data.departments.find((item) => item.id === employee.departmentId)?.name}</span>
              <span>{data.employees.find((item) => item.id === employee.managerId)?.fullName || "-"}</span>
              <span>{maskBank(employee.bankAccountNumber)}</span>
              <span><Badge tone={employee.status === "active" ? "good" : "warn"}>{employee.status}</Badge></span>
            </div>
          ))}
        </div>
      </section>
      {hasPermission(currentUser, PERMISSIONS.EMPLOYEE_MANAGE) && (
        <form className="panel" onSubmit={onCreate}>
          <h2>Create employee</h2>
          <div className="form-grid">
            <Field label="First name"><input required value={draft.firstName} onChange={(event) => setDraft({ ...draft, firstName: event.target.value })} /></Field>
            <Field label="Last name"><input required value={draft.lastName} onChange={(event) => setDraft({ ...draft, lastName: event.target.value })} /></Field>
            <Field label="Email"><input required type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></Field>
            <Field label="Department"><select value={draft.departmentId} onChange={(event) => setDraft({ ...draft, departmentId: event.target.value })}>{data.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Designation"><select value={draft.designationId} onChange={(event) => setDraft({ ...draft, designationId: event.target.value })}>{data.designations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Manager"><select value={draft.managerId} onChange={(event) => setDraft({ ...draft, managerId: event.target.value })}>{data.employees.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></Field>
            <Field label="Gross salary"><input type="number" value={draft.grossMonthlySalary} onChange={(event) => setDraft({ ...draft, grossMonthlySalary: event.target.value })} /></Field>
          </div>
          <button className="primary">Create employee</button>
        </form>
      )}
    </div>
  );
}

function Attendance({ data, currentUser, currentEmployee, correctionDraft, setCorrectionDraft, onCheckIn, onCheckOut, onCorrection, onApproveCorrection, onExport }) {
  const employeeRows = currentUser.role === ROLES.EMPLOYEE ? data.attendanceRecords.filter((item) => item.employeeId === currentEmployee.id) : data.attendanceRecords;
  return (
    <div className="stack">
      <section className="grid two">
        {hasPermission(currentUser, PERMISSIONS.ATTENDANCE_SELF) && (
          <div className="panel">
            <h2>Web check-in / check-out</h2>
            <p className="muted">IP address and user agent are captured server-side in production architecture.</p>
            <div className="actions">
              <button className="primary" onClick={onCheckIn}>Check in</button>
              <button className="secondary" onClick={onCheckOut}>Check out</button>
            </div>
          </div>
        )}
        <form className="panel" onSubmit={onCorrection}>
          <h2>Attendance correction</h2>
          <div className="form-grid">
            <Field label="Date"><input type="date" value={correctionDraft.date} onChange={(event) => setCorrectionDraft({ ...correctionDraft, date: event.target.value })} /></Field>
            <Field label="Requested check-in"><input value={correctionDraft.requestedCheckInAt} onChange={(event) => setCorrectionDraft({ ...correctionDraft, requestedCheckInAt: event.target.value })} /></Field>
            <Field label="Requested check-out"><input value={correctionDraft.requestedCheckOutAt} onChange={(event) => setCorrectionDraft({ ...correctionDraft, requestedCheckOutAt: event.target.value })} /></Field>
            <Field label="Reason"><input required value={correctionDraft.reason} onChange={(event) => setCorrectionDraft({ ...correctionDraft, reason: event.target.value })} /></Field>
          </div>
          <button className="primary">Submit correction</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Attendance records</h2><button className="secondary" onClick={onExport}>Export CSV</button></div>
        <div className="table">
          <div className="tr th"><span>Date</span><span>Employee</span><span>Status</span><span>Check-in</span><span>Check-out</span><span>Hours</span></div>
          {employeeRows.slice(0, 80).map((record) => {
            const employee = data.employees.find((item) => item.id === record.employeeId);
            return <div className="tr" key={record.id}><span>{record.date}</span><span>{employee?.fullName}</span><span><Badge>{record.status}</Badge></span><span>{record.checkInAt.slice(11, 16)}</span><span>{record.checkOutAt.slice(11, 16)}</span><span>{record.totalWorkedHours}</span></div>;
          })}
        </div>
      </section>
      {hasPermission(currentUser, PERMISSIONS.ATTENDANCE_APPROVE) && (
        <section className="panel">
          <h2>Pending correction approvals</h2>
          <div className="cards">
            {data.attendanceCorrections.filter((item) => item.status === "pending").map((item) => (
              <div className="mini-card" key={item.id}>
                <strong>{data.employees.find((employee) => employee.id === item.employeeId)?.fullName}</strong>
                <span>{item.date} · {item.reason}</span>
                <button className="primary" onClick={() => onApproveCorrection(item.id)}>Approve</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Leave({ data, currentUser, currentEmployee, draft, setDraft, onApply, onApprove, onReject, onExport }) {
  const ownRequests = data.leaveRequests.filter((request) => currentUser.role === ROLES.EMPLOYEE ? request.employeeId === currentUser.employeeId : true);
  return (
    <div className="stack">
      <section className="grid two">
        <div className="panel">
          <div className="panel-head"><h2>Leave balances</h2><button className="secondary" onClick={onExport}>Export CSV</button></div>
          <div className="metrics">
            {data.leaveTypes.map((type) => <Metric key={type.id} label={type.name} value={getLeaveBalance(data, currentEmployee?.id, type.id)} />)}
          </div>
        </div>
        {hasPermission(currentUser, PERMISSIONS.LEAVE_SELF) && (
          <form className="panel" onSubmit={onApply}>
            <h2>Apply leave</h2>
            <div className="form-grid">
              <Field label="Leave type"><select value={draft.leaveTypeId} onChange={(event) => setDraft({ ...draft, leaveTypeId: event.target.value })}>{data.leaveTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Start date"><input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></Field>
              <Field label="End date"><input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></Field>
              <Field label="Days"><input type="number" step="0.5" value={draft.days} onChange={(event) => setDraft({ ...draft, days: event.target.value })} /></Field>
              <Field label="Reason"><input required value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} /></Field>
            </div>
            <button className="primary">Submit leave</button>
          </form>
        )}
      </section>
      <section className="panel">
        <h2>Leave requests</h2>
        <div className="table">
          <div className="tr th"><span>Employee</span><span>Type</span><span>Dates</span><span>Days</span><span>Status</span><span>Action</span></div>
          {ownRequests.map((request) => (
            <div className="tr" key={request.id}>
              <span>{data.employees.find((employee) => employee.id === request.employeeId)?.fullName}</span>
              <span>{data.leaveTypes.find((type) => type.id === request.leaveTypeId)?.name}</span>
              <span>{request.startDate} to {request.endDate}</span>
              <span>{request.days}</span>
              <span><Badge tone={request.status === "approved" ? "good" : request.status === "rejected" ? "danger" : "warn"}>{request.status}</Badge></span>
              <span className="inline-actions">{request.status === "pending" && hasPermission(currentUser, PERMISSIONS.LEAVE_APPROVE) && <><button className="primary small" onClick={() => onApprove(request.id)}>Approve</button><button className="danger small" onClick={() => onReject(request.id)}>Reject</button></>}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Leave policy setup</h2>
        <div className="cards">{data.leaveTypes.map((type) => <div className="mini-card" key={type.id}><strong>{type.name}</strong><span>{type.paid ? "Paid" : "Unpaid"} · monthly accrual {type.monthlyAccrual} · max {type.maxBalance}</span></div>)}</div>
      </section>
    </div>
  );
}

function Payroll({ data, currentUser, draft, setDraft, onCreate, onApprove, onLock, onGenerate, onPublish }) {
  return (
    <div className="stack">
      <section className="grid two">
        {hasPermission(currentUser, PERMISSIONS.PAYROLL_MANAGE) && (
          <div className="panel">
            <h2>Create payroll run</h2>
            <div className="form-grid">
              <Field label="Month"><input type="number" min="1" max="12" value={draft.month} onChange={(event) => setDraft({ ...draft, month: event.target.value })} /></Field>
              <Field label="Year"><input type="number" value={draft.year} onChange={(event) => setDraft({ ...draft, year: event.target.value })} /></Field>
            </div>
            <button className="primary" onClick={onCreate}>Calculate payroll</button>
          </div>
        )}
        <div className="panel">
          <h2>Salary components</h2>
          <div className="cards">{data.salaryComponents.map((item) => <div className="mini-card" key={item.id}><strong>{item.name}</strong><span>{item.type} · {item.calculationType} · payslip {item.displayOnPayslip ? "yes" : "no"}</span></div>)}</div>
        </div>
      </section>
      <section className="panel">
        <h2>Payroll runs</h2>
        <div className="cards">
          {data.payrollRuns.map((run) => (
            <div className="mini-card wide" key={run.id}>
              <strong>{monthName(run.month)} {run.year} · <Badge>{run.status}</Badge></strong>
              <span>{run.totalEmployees} employees · Gross {formatINR(run.grossTotal)} · Net {formatINR(run.netTotal)}</span>
              <div className="actions">
                {hasPermission(currentUser, PERMISSIONS.PAYROLL_APPROVE) && <button className="primary" onClick={() => onApprove(run.id)}>Approve</button>}
                {hasPermission(currentUser, PERMISSIONS.PAYROLL_APPROVE) && <button className="secondary" onClick={() => onLock(run.id)}>Lock</button>}
                {hasPermission(currentUser, PERMISSIONS.PAYROLL_MANAGE) && <button className="secondary" onClick={() => onGenerate(run.id)}>Generate payslips</button>}
                {hasPermission(currentUser, PERMISSIONS.PAYROLL_MANAGE) && <button className="secondary" onClick={() => onPublish(run.id)}>Publish</button>}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Payroll calculation rows</h2>
        <div className="table">
          <div className="tr th"><span>Employee</span><span>Paid days</span><span>LOP</span><span>Earnings</span><span>Deductions</span><span>Net</span></div>
          {data.payrollRunEmployees.map((row) => <div className="tr" key={row.id}><span>{row.employeeName}</span><span>{row.payableDays}</span><span>{row.lopDays}</span><span>{formatINR(row.totalEarnings)}</span><span>{formatINR(row.totalDeductions)}</span><span>{formatINR(row.netPay)}</span></div>)}
        </div>
      </section>
    </div>
  );
}

function Payslips({ data, currentUser, selectedPayslip, setSelectedPayslipId, onPrint }) {
  const visible = data.payslips.filter((payslip) => canAccessPayslip(currentUser, payslip, data.employees));
  return (
    <div className="stack">
      <section className="grid two">
        <div className="panel">
          <h2>Payslip list</h2>
          <div className="cards">
            {visible.map((payslip) => {
              const employee = data.employees.find((item) => item.id === payslip.employeeId);
              return <button className="mini-card selectable" key={payslip.id} onClick={() => setSelectedPayslipId(payslip.id)}><strong>{employee?.fullName}</strong><span>{payslip.title} · {formatINR(payslip.netPay)}</span></button>;
            })}
          </div>
        </div>
        <div className="panel">
          <h2>Payslip actions</h2>
          {selectedPayslip ? (
            <>
              <Info label="Selected payslip" value={selectedPayslip.title} />
              <Info label="Net pay" value={`${formatINR(selectedPayslip.netPay)} · ${amountInWordsINR(selectedPayslip.netPay)}`} />
              <button className="primary" onClick={() => onPrint(selectedPayslip.id)}>Print / save PDF</button>
            </>
          ) : <p className="muted">No payslips generated yet.</p>}
        </div>
      </section>
      {selectedPayslip && <section className="panel preview" dangerouslySetInnerHTML={{ __html: buildPayslipHtml(data, selectedPayslip.id) }} />}
    </div>
  );
}

function Reports({ onExport, currentUser }) {
  const reports = [
    ["attendance", "Monthly attendance report", PERMISSIONS.REPORTS_HR],
    ["leave_balance", "Leave balance report", PERMISSIONS.REPORTS_HR],
    ["employee_master", "Employee master report", PERMISSIONS.REPORTS_HR],
    ["payroll_ready", "Payroll-ready salary processing data", PERMISSIONS.REPORTS_PAYROLL],
  ].filter(([, , permission]) => hasPermission(currentUser, permission));
  return (
    <section className="panel">
      <h2>Report center</h2>
      <div className="cards">
        {reports.map(([id, label]) => (
          <div className="mini-card" key={id}>
            <strong>{label}</strong>
            <span>CSV and XLSX exports with clear columns and masked bank account numbers.</span>
            <div className="actions">
              <button className="primary" onClick={() => onExport(id, false)}>CSV</button>
              <button className="secondary" onClick={() => onExport(id, true)}>XLSX</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Settings({ data, currentUser, draft, setDraft, onSave }) {
  function resetTheme() {
    setDraft({
      ...draft,
      selectedTheme: GLASSMORPHISM_THEME.themeId,
      themeName: GLASSMORPHISM_THEME.themeName,
      primaryColor: GLASSMORPHISM_THEME.primaryColor,
      secondaryColor: GLASSMORPHISM_THEME.secondaryColor,
      accentColor: GLASSMORPHISM_THEME.accentColor,
      themeColor: GLASSMORPHISM_THEME.primaryColor,
    });
  }

  return (
    <div className="stack">
      <form className="panel" onSubmit={onSave}>
        <h2>Company settings and branding</h2>
        <div className="form-grid">
          <Field label="Portal theme">
            <select
              value={draft.selectedTheme || GLASSMORPHISM_THEME.themeId}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  selectedTheme: event.target.value,
                  themeName: GLASSMORPHISM_THEME.themeName,
                })
              }
            >
              <option value={GLASSMORPHISM_THEME.themeId}>Glassmorphism HR Portal</option>
            </select>
          </Field>
          <Field label="Company name"><input disabled={!hasPermission(currentUser, PERMISSIONS.SETTINGS_MANAGE)} value={draft.companyName} onChange={(event) => setDraft({ ...draft, companyName: event.target.value })} /></Field>
          <Field label="Currency"><input value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })} /></Field>
          <Field label="Timezone"><input value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} /></Field>
          <Field label="Primary color"><input type="color" value={draft.primaryColor || GLASSMORPHISM_THEME.primaryColor} onChange={(event) => setDraft({ ...draft, primaryColor: event.target.value, themeColor: event.target.value })} /></Field>
          <Field label="Accent color"><input type="color" value={draft.accentColor || GLASSMORPHISM_THEME.accentColor} onChange={(event) => setDraft({ ...draft, accentColor: event.target.value })} /></Field>
          <Field label="Employee prefix"><input value={draft.employeeCodePrefix} onChange={(event) => setDraft({ ...draft, employeeCodePrefix: event.target.value })} /></Field>
          <Field label="Payroll cycle"><input value={draft.payrollCycle} onChange={(event) => setDraft({ ...draft, payrollCycle: event.target.value })} /></Field>
          <Field label="Address"><textarea value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></Field>
          <Field label="Payslip note"><textarea value={draft.payslipNote} onChange={(event) => setDraft({ ...draft, payslipNote: event.target.value })} /></Field>
        </div>
        {hasPermission(currentUser, PERMISSIONS.SETTINGS_MANAGE) && (
          <div className="actions">
            <button className="primary">Save settings</button>
            <button className="secondary" type="button" onClick={resetTheme}>Reset theme</button>
          </div>
        )}
      </form>
      <section className="panel theme-preview-card" style={themeStyle(draft)}>
        <div className="panel-head">
          <div>
            <h2>Theme preview</h2>
            <p className="muted">Glassmorphism HR Portal preview for sidebar, cards, buttons, badges, and table styling.</p>
          </div>
          <Badge tone="good">Active theme</Badge>
        </div>
        <div className="theme-preview-grid">
          <div className="preview-sidebar">
            <strong>ER {draft.companyName}</strong>
            <span className="preview-nav active">Dashboard</span>
            <span className="preview-nav">Payroll</span>
            <span className="preview-nav">Reports</span>
          </div>
          <div className="preview-card">
            <span>Total employees</span>
            <strong>{data.employees.length}</strong>
            <button className="primary" type="button">Primary action</button>
          </div>
          <div className="preview-card">
            <span>Status badge</span>
            <Badge tone="warn">Pending approval</Badge>
            <div className="preview-table-row"><b>Payroll</b><span>{formatINR(data.payrollRuns[0]?.netTotal || 0)}</span></div>
          </div>
        </div>
      </section>
      <section className="grid three">
        <ConfigList title="Departments" items={data.departments.map((item) => `${item.code} · ${item.name}`)} />
        <ConfigList title="Designations" items={data.designations.map((item) => item.name)} />
        <ConfigList title="Shifts" items={data.shifts.map((item) => `${item.name} · ${item.startTime}-${item.endTime}`)} />
        <ConfigList title="Holidays" items={data.holidays.map((item) => `${item.date} · ${item.name}`)} />
        <ConfigList title="Roles" items={Object.values(ROLE_LABELS)} />
        <ConfigList title="Payroll settings" items={[data.companySettings.salaryDayCalculation, "Default LOP = gross / salary days * LOP days", "PF, ESI, PT, TDS are configurable and disabled by default"]} />
      </section>
    </div>
  );
}

function ConfigList({ title, items }) {
  return <div className="panel"><h2>{title}</h2><div className="summary-list">{items.map((item) => <Info key={item} label={title} value={item} />)}</div></div>;
}

function Audit({ data }) {
  return (
    <section className="panel">
      <h2>Audit logs</h2>
      <div className="table audit">
        <div className="tr th"><span>Time</span><span>Actor</span><span>Action</span><span>Entity</span><span>ID</span></div>
        {data.auditLogs.map((item) => <div className="tr" key={item.id}><span>{formatDate(item.timestamp)}</span><span>{item.actorRole}</span><span>{item.action}</span><span>{item.entityType}</span><span>{item.entityId}</span></div>)}
      </div>
    </section>
  );
}

function Info({ label, value }) {
  return <div className="info"><span>{label}</span><strong>{value}</strong></div>;
}

const printStyles = `
  body { font-family: Arial, sans-serif; background: #fff; color: #111827; }
  .payslip-print { max-width: 920px; margin: 0 auto; border: 1px solid #1f3d5a; }
  .payslip-print h1 { margin: 0; padding: 14px; color: #fff; background: var(--color-primary, #4F46E5); text-align: center; font-size: 20px; letter-spacing: 0; }
  .company-block { display: grid; gap: 4px; padding: 14px; border-bottom: 1px solid #cbd5e1; }
  .payslip-grid { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid #cbd5e1; }
  .payslip-grid div, .payslip-summary div { display: grid; gap: 4px; padding: 10px; border-right: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; }
  .payslip-grid b, .payslip-summary b { color: #334155; font-size: 12px; }
  .payslip-tables { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  table { width: 100%; border-collapse: collapse; }
  th { background: var(--color-primary, #4F46E5); color: #fff; text-align: left; padding: 10px; }
  td { border: 1px solid #cbd5e1; padding: 9px; }
  .payslip-summary { display: grid; grid-template-columns: repeat(3, 1fr); }
  .payslip-summary p { grid-column: 1 / -1; padding: 12px; margin: 0; font-weight: 700; }
  footer { padding: 12px; text-align: center; color: #475569; border-top: 1px solid #cbd5e1; }
`;

const styles = `
  :root {
    color-scheme: light;
    font-family: Inter, "Geist Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .glass-theme {
    --color-secondary: #7C3AED;
    --color-accent-soft: #A5F3FC;
    --color-background-start: #EEF2FF;
    --color-background-middle: #F5F3FF;
    --color-background-end: #ECFEFF;
    --color-card: rgba(255, 255, 255, 0.72);
    --color-card-strong: rgba(255, 255, 255, 0.9);
    --color-card-border: rgba(255, 255, 255, 0.45);
    --color-text-primary: #111827;
    --color-text-secondary: #475569;
    --color-text-muted: #64748B;
    --color-success: #10B981;
    --color-warning: #F59E0B;
    --color-danger: #EF4444;
    --color-info: #3B82F6;
    --sidebar-bg: rgba(255, 255, 255, 0.65);
    --header-bg: rgba(255, 255, 255, 0.58);
    --table-header-bg: rgba(238, 242, 255, 0.95);
    --table-row-hover: rgba(79, 70, 229, 0.055);
    --radius-card: 24px;
    --radius-control: 14px;
    --shadow-card: 0 24px 70px rgba(79, 70, 229, 0.12), 0 1px 0 rgba(255,255,255,0.72) inset;
    --shadow-card-hover: 0 30px 90px rgba(79, 70, 229, 0.18);
    --shadow-button: 0 14px 30px rgba(79, 70, 229, 0.28);
    --blur-glass: blur(18px);
    --focus-ring: 0 0 0 4px rgba(6, 182, 212, 0.2);
  }
  * { box-sizing: border-box; }
  body { margin: 0; color: var(--color-text-primary); }
  button, input, select, textarea { font: inherit; }
  button { border: 0; cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: 0.55; }
  h1, h2, p { margin-top: 0; letter-spacing: 0; }
  h1 { font-size: clamp(24px, 3vw, 34px); margin-bottom: 5px; font-weight: 900; }
  h2 { font-size: 18px; margin-bottom: 14px; font-weight: 850; }
  small { display: block; color: var(--color-text-muted); margin-top: 3px; }
  .login-shell,
  .app-shell {
    position: relative;
    isolation: isolate;
    min-height: 100vh;
    overflow-x: hidden;
    background:
      radial-gradient(circle at 12% 12%, rgba(165, 243, 252, 0.7), transparent 28%),
      linear-gradient(135deg, var(--color-background-start), var(--color-background-middle) 48%, var(--color-background-end));
  }
  .ambient {
    position: fixed;
    z-index: -1;
    width: 34vw;
    min-width: 300px;
    aspect-ratio: 1;
    border-radius: 999px;
    filter: blur(46px);
    opacity: 0.42;
    pointer-events: none;
    animation: drift 18s ease-in-out infinite alternate;
  }
  .ambient-one { top: -120px; right: 8%; background: color-mix(in srgb, var(--color-primary) 48%, transparent); }
  .ambient-two { bottom: -150px; left: -5%; background: color-mix(in srgb, var(--color-accent) 52%, transparent); animation-delay: -5s; }
  .ambient-three { top: 38%; right: -110px; background: color-mix(in srgb, var(--color-secondary) 45%, transparent); animation-delay: -9s; }
  @keyframes drift {
    from { transform: translate3d(0, 0, 0) scale(1); }
    to { transform: translate3d(28px, -22px, 0) scale(1.08); }
  }
  .login-shell {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(320px, 440px);
    gap: 42px;
    align-items: center;
    padding: clamp(22px, 5vw, 58px);
  }
  .login-hero { animation: fadeUp 280ms ease both; }
  .login-hero h1 { font-size: clamp(42px, 8vw, 82px); line-height: 0.98; max-width: 780px; }
  .login-hero p { max-width: 590px; color: var(--color-text-secondary); font-size: 18px; line-height: 1.6; }
  .brand-tile {
    width: 76px;
    height: 76px;
    display: grid;
    place-items: center;
    border-radius: 22px;
    background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
    color: white;
    font-weight: 950;
    font-size: 24px;
    margin-bottom: 20px;
    box-shadow: var(--shadow-button);
    animation: logoPop 360ms cubic-bezier(.2,.8,.2,1) both;
  }
  .login-card,
  .panel,
  .metric,
  .mini-card,
  .info {
    background: var(--color-card);
    color: var(--color-text-primary);
    border: 1px solid var(--color-card-border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    backdrop-filter: var(--blur-glass);
    -webkit-backdrop-filter: var(--blur-glass);
  }
  .login-card {
    display: grid;
    gap: 16px;
    padding: clamp(22px, 4vw, 30px);
    animation: fadeUp 320ms ease 80ms both;
  }
  .login-notes {
    display: grid;
    gap: 8px;
    max-width: 760px;
    padding: 15px;
    border: 1px solid rgba(255,255,255,0.62);
    border-radius: 20px;
    background: rgba(255,255,255,0.38);
    color: var(--color-text-secondary);
    backdrop-filter: blur(14px);
  }
  .field { display: grid; gap: 7px; color: var(--color-text-secondary); font-size: 12px; font-weight: 850; }
  input, select, textarea {
    width: 100%;
    border: 1px solid rgba(148, 163, 184, 0.34);
    border-radius: var(--radius-control);
    padding: 11px 12px;
    min-height: 44px;
    background: rgba(255,255,255,0.84);
    color: var(--color-text-primary);
    outline: none;
    transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
  }
  input:focus, select:focus, textarea:focus { border-color: var(--color-accent); box-shadow: var(--focus-ring); background: #fff; }
  textarea { min-height: 96px; resize: vertical; }
  .error { padding: 11px; border-radius: 16px; background: rgba(254, 226, 226, 0.88); color: #991b1b; font-weight: 850; }
  .primary, .secondary, .ghost, .danger {
    min-height: 40px;
    border-radius: 14px;
    padding: 0 15px;
    font-weight: 850;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease, border-color 160ms ease;
  }
  .primary {
    background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
    color: white;
    box-shadow: var(--shadow-button);
  }
  .secondary {
    background: rgba(255,255,255,0.66);
    color: var(--color-text-primary);
    border: 1px solid rgba(255,255,255,0.65);
    backdrop-filter: blur(12px);
  }
  .ghost { background: transparent; color: inherit; border: 1px solid rgba(148, 163, 184, 0.34); }
  .danger { background: rgba(254, 226, 226, 0.92); color: #b91c1c; }
  .primary:hover, .secondary:hover, .ghost:hover, .danger:hover { transform: translateY(-1px); box-shadow: var(--shadow-card-hover); }
  .primary:active, .secondary:active, .ghost:active, .danger:active { transform: translateY(0); }
  .small { min-height: 31px; padding: 0 10px; font-size: 12px; border-radius: 12px; }
  .app-shell { display: grid; grid-template-columns: 268px minmax(0, 1fr); }
  .sidebar {
    position: sticky;
    top: 16px;
    height: calc(100vh - 32px);
    margin: 16px 0 16px 16px;
    background: var(--sidebar-bg);
    color: var(--color-text-primary);
    border: 1px solid var(--color-card-border);
    border-radius: 28px;
    box-shadow: var(--shadow-card);
    backdrop-filter: var(--blur-glass);
    -webkit-backdrop-filter: var(--blur-glass);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    animation: fadeUp 220ms ease both;
  }
  .brand { display: flex; align-items: center; gap: 11px; background: transparent; color: var(--color-text-primary); text-align: left; padding: 0; }
  .brand span, .user-chip span {
    width: 40px;
    height: 40px;
    border-radius: 15px;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    color: white;
    font-weight: 950;
    box-shadow: var(--shadow-button);
  }
  .sidebar nav { display: grid; gap: 7px; }
  .sidebar nav button {
    min-height: 42px;
    border-radius: 15px;
    background: transparent;
    color: var(--color-text-secondary);
    text-align: left;
    padding: 0 12px;
    font-weight: 850;
    transition: background 160ms ease, transform 160ms ease, color 160ms ease;
  }
  .sidebar nav button.active,
  .sidebar nav button:hover {
    background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
    color: white;
    transform: translateX(2px);
    box-shadow: var(--shadow-button);
  }
  .workspace { min-width: 0; padding: 16px 22px 24px; display: grid; gap: 18px; }
  .topbar {
    position: sticky;
    top: 14px;
    z-index: 10;
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    background: var(--header-bg);
    border: 1px solid var(--color-card-border);
    border-radius: 24px;
    box-shadow: var(--shadow-card);
    backdrop-filter: var(--blur-glass);
    -webkit-backdrop-filter: var(--blur-glass);
    padding: 16px 18px;
    animation: fadeUp 240ms ease 40ms both;
  }
  .topbar p { margin: 0; color: var(--color-text-muted); }
  .user-chip { display: flex; align-items: center; gap: 10px; }
  .stack { display: grid; gap: 18px; animation: fadeUp 260ms ease 70ms both; }
  .grid { display: grid; gap: 18px; }
  .grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .panel { padding: 20px; min-width: 0; }
  .panel:hover, .metric:hover, .mini-card:hover { box-shadow: var(--shadow-card-hover); }
  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(168px, 1fr)); gap: 14px; }
  .metric { padding: 17px; animation: fadeUp 260ms ease both; }
  .metric span { color: var(--color-text-muted); font-size: 12px; font-weight: 900; text-transform: uppercase; }
  .metric strong { display: block; margin-top: 9px; font-size: 30px; font-variant-numeric: tabular-nums; }
  .good { color: var(--color-success); }
  .warn { color: var(--color-warning); }
  .panel-head, .actions, .inline-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .actions, .inline-actions { justify-content: flex-start; }
  .filters, .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 12px; margin-bottom: 14px; }
  .table {
    display: grid;
    overflow-x: auto;
    background: rgba(255,255,255,0.92);
    border: 1px solid rgba(226, 232, 240, 0.9);
    border-radius: 20px;
    padding: 0 14px;
    box-shadow: 0 12px 34px rgba(15, 23, 42, 0.06);
  }
  .tr {
    min-width: 880px;
    display: grid;
    grid-template-columns: repeat(6, minmax(120px, 1fr));
    gap: 12px;
    align-items: center;
    border-bottom: 1px solid #e2e8f0;
    padding: 12px 0;
    transition: background 140ms ease;
    font-variant-numeric: tabular-nums;
  }
  .tr:hover:not(.th) { background: var(--table-row-hover); }
  .tr:last-child { border-bottom: 0; }
  .audit .tr { grid-template-columns: repeat(5, minmax(140px, 1fr)); }
  .th {
    position: sticky;
    top: 0;
    z-index: 1;
    color: var(--color-text-secondary);
    font-size: 12px;
    font-weight: 950;
    text-transform: uppercase;
    background: var(--table-header-bg);
    border-radius: 14px;
    margin-top: 10px;
    padding-inline: 10px;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    min-height: 25px;
    border-radius: 999px;
    padding: 4px 10px;
    background: rgba(226, 232, 240, 0.92);
    color: #334155;
    font-size: 12px;
    font-weight: 950;
    width: fit-content;
    border: 1px solid rgba(255,255,255,0.7);
  }
  .badge.good { background: rgba(209, 250, 229, 0.95); color: #047857; }
  .badge.warn { background: rgba(254, 243, 199, 0.95); color: #b45309; }
  .badge.danger { background: rgba(254, 226, 226, 0.95); color: #b91c1c; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 245px), 1fr)); gap: 13px; }
  .mini-card, .selectable {
    display: grid;
    gap: 8px;
    text-align: left;
    padding: 14px;
    color: var(--color-text-primary);
    transition: transform 160ms ease, box-shadow 160ms ease;
  }
  .selectable:hover { transform: translateY(-2px); }
  .mini-card span { color: var(--color-text-muted); line-height: 1.45; }
  .wide { grid-column: 1 / -1; }
  .summary-list { display: grid; gap: 10px; }
  .info { gap: 5px; padding: 11px; background: rgba(248,250,252,0.78); }
  .info span { color: var(--color-text-muted); font-size: 12px; font-weight: 900; }
  .info strong { overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  .muted { color: var(--color-text-muted); line-height: 1.55; }
  .toast {
    position: fixed;
    right: 18px;
    bottom: 18px;
    background: rgba(17, 24, 39, 0.84);
    color: white;
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 18px;
    padding: 12px 14px;
    box-shadow: 0 18px 50px rgba(15,23,42,0.25);
    font-weight: 850;
    z-index: 40;
    backdrop-filter: blur(14px);
    animation: toastIn 180ms ease both;
  }
  .theme-preview-card { overflow: hidden; }
  .theme-preview-grid { display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 14px; }
  .preview-sidebar, .preview-card {
    border: 1px solid var(--color-card-border);
    border-radius: 22px;
    background: rgba(255,255,255,0.58);
    backdrop-filter: blur(14px);
    padding: 14px;
    display: grid;
    gap: 10px;
  }
  .preview-nav { min-height: 34px; display: flex; align-items: center; border-radius: 13px; padding: 0 10px; color: var(--color-text-secondary); font-weight: 800; }
  .preview-nav.active { color: white; background: linear-gradient(135deg, var(--color-primary), var(--color-secondary)); }
  .preview-card strong { font-size: 28px; font-variant-numeric: tabular-nums; }
  .preview-table-row { display: flex; justify-content: space-between; gap: 10px; border-radius: 12px; padding: 9px; background: rgba(255,255,255,0.88); }
  .preview .payslip-print { max-width: 100%; border: 1px solid #1f3d5a; background: white; }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes logoPop {
    from { opacity: 0; transform: translateY(8px) scale(0.92); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes toastIn {
    from { opacity: 0; transform: translateY(8px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  ${printStyles}
  @media (max-width: 1100px) {
    .grid.three, .theme-preview-grid { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 920px) {
    .login-shell, .app-shell { grid-template-columns: 1fr; }
    .login-shell { padding: 20px; }
    .sidebar {
      position: static;
      height: auto;
      margin: 12px;
      border-radius: 24px;
    }
    .sidebar nav { grid-template-columns: repeat(auto-fit, minmax(124px, 1fr)); }
    .grid.two, .grid.three, .theme-preview-grid { grid-template-columns: 1fr; }
    .topbar { position: static; align-items: flex-start; flex-direction: column; }
    .workspace { padding: 0 14px 14px; }
    .login-hero h1 { font-size: clamp(34px, 13vw, 56px); }
  }
  @media (max-width: 560px) {
    .panel, .login-card { border-radius: 20px; padding: 16px; }
    .metrics { grid-template-columns: 1fr; }
    .user-chip { width: 100%; justify-content: space-between; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

export default VaultAccess;
