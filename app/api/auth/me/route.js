import { csrfToken, loadAppState, publicUser, requireSession } from "../../_shared.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  const data = await loadAppState();
  const user = data.users.find((item) => item.id === auth.session.userId);
  return Response.json({ ok: true, user: publicUser(user), csrfToken: csrfToken(auth.token) });
}
