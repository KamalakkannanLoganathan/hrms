import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  if (!line || /^\s*#/.test(line) || !line.includes("=")) continue;
  const index = line.indexOf("=");
  const key = line.slice(0, index).trim();
  const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
  if (key && process.env[key] == null) process.env[key] = value;
}

const url = `${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/hrms_app_state?id=eq.eagle_rcm&select=data`;
const response = await fetch(url, {
  headers: {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  },
});

const text = await response.text();
let rowCount = 0;
let stateKeys = [];
try {
  const rows = JSON.parse(text);
  rowCount = Array.isArray(rows) ? rows.length : 0;
  stateKeys = rows?.[0]?.data ? Object.keys(rows[0].data).sort() : [];
} catch {
  stateKeys = [];
}

console.log(JSON.stringify({
  ok: response.ok,
  status: response.status,
  contentType: response.headers.get("content-type"),
  rowCount,
  stateKeys,
}));
