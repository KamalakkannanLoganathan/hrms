import {
  canPersistState,
  clientStateForUser,
  csrfToken,
  loadAppState,
  mergeServerOnlyFields,
  requireCsrf,
  requireSession,
  saveAppState,
  validateStatePayload,
} from "../_shared.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const data = await loadAppState();
  return Response.json({ ok: true, data: clientStateForUser(data, auth.session), csrfToken: csrfToken(auth.token) });
}

export async function PUT(request) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  if (!requireCsrf(request, auth.token)) return Response.json({ ok: false, error: "Invalid CSRF token." }, { status: 403 });
  const data = await loadAppState();
  const actor = data.users.find((user) => user.id === auth.session.userId);
  if (!canPersistState(actor)) return Response.json({ ok: false, error: "Not authorized." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  validateStatePayload(body.data);
  await saveAppState(mergeServerOnlyFields(data, body.data));
  return Response.json({ ok: true, csrfToken: csrfToken(auth.token) });
}
