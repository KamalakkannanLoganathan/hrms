import { NextResponse } from "next/server";
import { CSRF_COOKIE, SESSION_COOKIE, cookieOptions, readableCookieOptions, requireCsrf, requireSession } from "../../_shared.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  if (!requireCsrf(request, auth.token)) return Response.json({ ok: false, error: "Invalid CSRF token." }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  response.cookies.set(CSRF_COOKIE, "", readableCookieOptions(0));
  return response;
}
