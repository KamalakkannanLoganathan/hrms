import { getConfig, requireCsrf, requireSession, supabaseFetch, validateStoragePath } from "../../_shared.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const auth = requireSession(request);
  if (auth.error) return auth.error;
  if (!requireCsrf(request, auth.token)) return Response.json({ ok: false, error: "Invalid CSRF token." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const path = validateStoragePath(body.path);
  const config = getConfig();
  const result = await supabaseFetch(`/storage/v1/object/sign/${config.storageBucket}/${encodeURIComponent(path)}`, {
    method: "POST",
    body: JSON.stringify({ expiresIn: Number(body.expiresIn || 300) }),
  });
  return Response.json({ ok: true, signedUrl: result?.signedURL || result?.signedUrl });
}
