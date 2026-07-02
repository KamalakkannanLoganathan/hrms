import { NextResponse } from "next/server";
import { CSRF_COOKIE, SESSION_COOKIE, cookieOptions, createSession, csrfToken, login, publicUser, readableCookieOptions } from "../../_shared.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 8;

function allowed(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const item = attempts.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (item.resetAt < now) {
    item.count = 0;
    item.resetAt = now + WINDOW_MS;
  }
  item.count += 1;
  attempts.set(ip, item);
  return item.count <= LIMIT;
}

export async function POST(request) {
  if (!allowed(request)) return Response.json({ ok: false, error: "Too many login attempts. Try again later." }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const result = await login(String(body.email || ""), String(body.password || ""));
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: 401 });
  const token = createSession(result.user);
  const csrf = csrfToken(token);
  const response = NextResponse.json({ ok: true, user: publicUser(result.user), csrfToken: csrf });
  response.cookies.set(SESSION_COOKIE, token, cookieOptions(8 * 60 * 60));
  response.cookies.set(CSRF_COOKIE, csrf, readableCookieOptions(8 * 60 * 60));
  return response;
}
