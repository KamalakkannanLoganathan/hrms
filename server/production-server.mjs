import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import bcrypt from "bcryptjs";
import {
  DEFAULT_PASSWORD,
  authenticateUser,
  seedAppData,
} from "../src/hrCore.js";

const ROOT = resolve(process.cwd());
const DIST_DIR = resolve(ROOT, "dist");
const APP_STATE_ID = "eagle_rcm";
const SESSION_COOKIE = "ercm_session";
const CSRF_COOKIE = "ercm_csrf";
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 8;
const loginAttempts = new Map();

loadDotEnv(".env.local");

const config = validateEnv();

function loadDotEnv(file) {
  const path = join(ROOT, file);
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || /^\s*#/.test(line) || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

function validateEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!authSecret || authSecret.length < 24) throw new Error("AUTH_SECRET or NEXTAUTH_SECRET must be at least 24 characters.");
  return {
    port: Number(process.env.PORT || 3000),
    appUrl: process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000",
    supabaseUrl: process.env.SUPABASE_URL.replace(/\/$/, ""),
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET,
    authSecret,
    secureCookies: (process.env.APP_URL || process.env.NEXTAUTH_URL || "").startsWith("https://"),
  };
}

function json(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...securityHeaders(),
    ...extraHeaders,
  });
  res.end(body);
}

function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  };
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax", "HttpOnly"];
  if (config.secureCookies) parts.push("Secure");
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join("; ");
}

function readableCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax"];
  if (config.secureCookies) parts.push("Secure");
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join("; ");
}

function sign(value) {
  return createHmac("sha256", config.authSecret).update(value).digest("base64url");
}

function createSession(user) {
  const payload = {
    userId: user.id,
    employeeId: user.employeeId,
    role: user.role,
    exp: Date.now() + 8 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function verifySession(token) {
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

function csrfToken(sessionToken) {
  return sign(`${sessionToken}:csrf`).slice(0, 48);
}

function requireCsrf(req, sessionToken) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const cookies = parseCookies(req);
  const header = req.headers["x-csrf-token"];
  return Boolean(header && cookies[CSRF_COOKIE] && header === cookies[CSRF_COOKIE] && header === csrfToken(sessionToken));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body too large.");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function supabaseFetch(path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed ${response.status}: ${text}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function loadAppState() {
  const rows = await supabaseFetch(`/rest/v1/hrms_app_state?id=eq.${APP_STATE_ID}&select=data`);
  if (Array.isArray(rows) && rows[0]?.data) return rows[0].data;
  const seeded = seedAppData();
  await saveAppState(seeded);
  return seeded;
}

async function saveAppState(data) {
  await supabaseFetch("/rest/v1/hrms_app_state?on_conflict=id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ id: APP_STATE_ID, data }),
  });
}

function clientStateForUser(data, session) {
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

function validateStatePayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Invalid state payload.");
  const requiredArrays = ["users", "employees", "attendanceRecords", "leaveRequests", "payrollRuns", "payslips", "auditLogs"];
  for (const key of requiredArrays) {
    if (!Array.isArray(payload[key])) throw new Error(`Invalid state payload: ${key} must be an array.`);
  }
  if (!payload.companySettings?.companyName || String(payload.companySettings.companyName).length > 120) {
    throw new Error("Invalid company settings.");
  }
}

function canPersistState(actor) {
  return ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "BOSS", "MANAGER"].includes(actor.role);
}

function mergeServerOnlyFields(existing, incoming) {
  const userSecrets = new Map(existing.users.map((user) => [user.id, user.passwordHash]));
  return {
    ...incoming,
    users: incoming.users.map((user) => ({
      ...user,
      passwordHash: user.passwordHash || userSecrets.get(user.id) || bcrypt.hashSync(DEFAULT_PASSWORD, 10),
    })),
  };
}

function checkLoginRate(req) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const item = loginAttempts.get(ip) || { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  if (item.resetAt < now) {
    item.count = 0;
    item.resetAt = now + LOGIN_WINDOW_MS;
  }
  item.count += 1;
  loginAttempts.set(ip, item);
  return item.count <= LOGIN_LIMIT;
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/health") return json(res, 200, { ok: true, storageBucket: config.storageBucket });

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    if (!checkLoginRate(req)) return json(res, 429, { ok: false, error: "Too many login attempts. Try again later." });
    const body = await readBody(req);
    const data = await loadAppState();
    const result = authenticateUser(data.users, String(body.email || ""), String(body.password || ""));
    if (!result.ok) return json(res, 401, { ok: false, error: result.reason });
    const users = data.users.map((user) => (user.id === result.user.id ? { ...user, ...result.user } : user));
    await saveAppState({ ...data, users });
    const token = createSession(result.user);
    return json(res, 200, { ok: true, user: publicUser(result.user), csrfToken: csrfToken(token) }, {
      "set-cookie": [cookie(SESSION_COOKIE, token, { maxAge: 8 * 60 * 60 }), readableCookie(CSRF_COOKIE, csrfToken(token), { maxAge: 8 * 60 * 60 })],
    });
  }

  const cookies = parseCookies(req);
  const sessionToken = cookies[SESSION_COOKIE];
  const session = verifySession(sessionToken);
  if (!session) return json(res, 401, { ok: false, error: "Authentication required." });
  if (!requireCsrf(req, sessionToken)) return json(res, 403, { ok: false, error: "Invalid CSRF token." });

  if (url.pathname === "/api/auth/me" && req.method === "GET") {
    const data = await loadAppState();
    const user = data.users.find((item) => item.id === session.userId);
    return json(res, 200, { ok: true, user: publicUser(user), csrfToken: csrfToken(sessionToken) });
  }

  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    return json(res, 200, { ok: true }, {
      "set-cookie": [cookie(SESSION_COOKIE, "", { maxAge: 0 }), readableCookie(CSRF_COOKIE, "", { maxAge: 0 })],
    });
  }

  if (url.pathname === "/api/state" && req.method === "GET") {
    const data = await loadAppState();
    return json(res, 200, { ok: true, data: clientStateForUser(data, session), csrfToken: csrfToken(sessionToken) });
  }

  if (url.pathname === "/api/state" && req.method === "PUT") {
    const data = await loadAppState();
    const actor = data.users.find((user) => user.id === session.userId);
    if (!actor || !canPersistState(actor)) return json(res, 403, { ok: false, error: "Not authorized." });
    const body = await readBody(req);
    validateStatePayload(body.data);
    await saveAppState(mergeServerOnlyFields(data, body.data));
    return json(res, 200, { ok: true, csrfToken: csrfToken(sessionToken) });
  }

  if (url.pathname === "/api/storage/signed-url" && req.method === "POST") {
    const body = await readBody(req);
    const path = validateStoragePath(body.path);
    const result = await supabaseFetch(`/storage/v1/object/sign/${config.storageBucket}/${encodeURIComponent(path)}`, {
      method: "POST",
      body: JSON.stringify({ expiresIn: Number(body.expiresIn || 300) }),
    });
    return json(res, 200, { ok: true, signedUrl: result?.signedURL || result?.signedUrl });
  }

  return json(res, 404, { ok: false, error: "API route not found." });
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function validateStoragePath(path) {
  const value = String(path || "");
  if (!value || value.includes("..") || value.startsWith("/") || value.length > 240) throw new Error("Invalid storage path.");
  if (!/^[a-zA-Z0-9/_.,=-]+$/.test(value)) throw new Error("Invalid storage path.");
  return value;
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = resolve(DIST_DIR, `.${normalize(pathname)}`);
  if (!filePath.startsWith(DIST_DIR) || !existsSync(filePath)) {
    return serveFile(res, join(DIST_DIR, "index.html"));
  }
  return serveFile(res, filePath);
}

function serveFile(res, filePath) {
  const type = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
  }[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "content-type": type, ...securityHeaders() });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, config.appUrl);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (error) {
    return json(res, 500, { ok: false, error: "Server error.", detail: process.env.NODE_ENV === "production" ? undefined : error.message });
  }
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(config.port, () => {
    console.log(`Eagle RCM HRMS listening on ${config.port}`);
  });
}

export {
  createSession,
  csrfToken,
  validateEnv,
  validateStatePayload,
  verifySession,
};
