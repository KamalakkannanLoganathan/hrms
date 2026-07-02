import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { DEFAULT_PASSWORD, authenticateUser, seedAppData } from "../../src/hrCore.js";

export const APP_STATE_ID = "eagle_rcm";
export const SESSION_COOKIE = "ercm_session";
export const CSRF_COOKIE = "ercm_csrf";

export function getConfig() {
  const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!authSecret || authSecret.length < 24) throw new Error("AUTH_SECRET or NEXTAUTH_SECRET must be at least 24 characters.");
  const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  return {
    appUrl,
    supabaseUrl: process.env.SUPABASE_URL.replace(/\/$/, ""),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET,
    authSecret,
    secureCookies: appUrl.startsWith("https://"),
  };
}

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

export function sign(value) {
  const config = getConfig();
  return createHmac("sha256", config.authSecret).update(value).digest("base64url");
}

export function createSession(user) {
  const payload = {
    userId: user.id,
    employeeId: user.employeeId,
    role: user.role,
    exp: Date.now() + 8 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySession(token) {
  if (!token || !token.includes(".")) return null;
  const [encoded, signature] = token.split(".");
  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

export function csrfToken(sessionToken) {
  return sign(`${sessionToken}:csrf`).slice(0, 48);
}

export function cookieOptions(maxAge) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: getConfig().secureCookies,
    maxAge,
  };
}

export function readableCookieOptions(maxAge) {
  return {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    secure: getConfig().secureCookies,
    maxAge,
  };
}

export function getCookie(request, name) {
  return request.cookies.get(name)?.value || "";
}

export function requireSession(request) {
  const token = getCookie(request, SESSION_COOKIE);
  const session = verifySession(token);
  if (!session) return { error: Response.json({ ok: false, error: "Authentication required." }, { status: 401 }) };
  return { token, session };
}

export function requireCsrf(request, sessionToken) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const cookie = getCookie(request, CSRF_COOKIE);
  const header = request.headers.get("x-csrf-token");
  return Boolean(header && cookie && header === cookie && header === csrfToken(sessionToken));
}

export async function supabaseFetch(path, options = {}) {
  const config = getConfig();
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed ${response.status}: ${text}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function loadAppState() {
  const rows = await supabaseFetch(`/rest/v1/hrms_app_state?id=eq.${APP_STATE_ID}&select=data`);
  if (Array.isArray(rows) && rows[0]?.data) return rows[0].data;
  const seeded = seedAppData();
  await saveAppState(seeded);
  return seeded;
}

export async function saveAppState(data) {
  await supabaseFetch("/rest/v1/hrms_app_state?on_conflict=id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: APP_STATE_ID, data }),
  });
}

export function validateStatePayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Invalid state payload.");
  const requiredArrays = ["users", "employees", "attendanceRecords", "leaveRequests", "payrollRuns", "payslips", "auditLogs"];
  for (const key of requiredArrays) {
    if (!Array.isArray(payload[key])) throw new Error(`Invalid state payload: ${key} must be an array.`);
  }
  if (!payload.companySettings?.companyName || String(payload.companySettings.companyName).length > 120) {
    throw new Error("Invalid company settings.");
  }
}

export function mergeServerOnlyFields(existing, incoming) {
  const userSecrets = new Map(existing.users.map((user) => [user.id, user.passwordHash]));
  return {
    ...incoming,
    users: incoming.users.map((user) => ({
      ...user,
      passwordHash: user.passwordHash || userSecrets.get(user.id) || bcrypt.hashSync(DEFAULT_PASSWORD, 10),
    })),
  };
}

export function clientStateForUser(data, session) {
  const actor = data.users.find((user) => user.id === session.userId);
  if (!actor) return null;
  const sanitized = {
    ...data,
    users: data.users.map(({ passwordHash, ...user }) => user),
  };
  if (actor.role === "EMPLOYEE") {
    sanitized.employees = data.employees.filter((employee) => employee.id === actor.employeeId);
    sanitized.payslips = data.payslips.filter((payslip) => payslip.employeeId === actor.employeeId);
    sanitized.payrollRunEmployees = data.payrollRunEmployees.filter((row) => row.employeeId === actor.employeeId);
  }
  return sanitized;
}

export function canPersistState(actor) {
  return ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "BOSS", "MANAGER"].includes(actor?.role);
}

export async function login(email, password) {
  const data = await loadAppState();
  const result = authenticateUser(data.users, email, password);
  if (!result.ok) return { ok: false, error: result.reason };
  const users = data.users.map((user) => (user.id === result.user.id ? { ...user, ...result.user } : user));
  await saveAppState({ ...data, users });
  return { ok: true, user: result.user };
}

export function validateStoragePath(path) {
  const value = String(path || "");
  if (!value || value.includes("..") || value.startsWith("/") || value.length > 240) throw new Error("Invalid storage path.");
  if (!/^[a-zA-Z0-9/_.,=-]+$/.test(value)) throw new Error("Invalid storage path.");
  return value;
}
