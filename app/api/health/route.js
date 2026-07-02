import { getConfig } from "../_shared.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const config = getConfig();
  return Response.json({ ok: true, storageBucket: config.storageBucket });
}
