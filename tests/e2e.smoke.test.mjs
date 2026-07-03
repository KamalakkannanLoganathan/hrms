import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("Next.js deployment assets are present", () => {
  assert.equal(existsSync("app/page.jsx"), true);
  assert.equal(existsSync("app/layout.jsx"), true);
  assert.equal(existsSync("vercel.json"), true);
});

test("package scripts use Next.js only", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.scripts.dev, "next dev");
  assert.equal(pkg.scripts.build, "next build");
  assert.equal(pkg.scripts.start, "next start");
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ["bcryptjs", "next", "react", "react-dom", "xlsx"]);
  assert.equal(Object.keys(pkg.scripts).every((script) => !script.includes("container")), true);
});

test("supabase migration removes direct browser access through RLS", () => {
  const migration = readFileSync("supabase/migrations/001_hrms_app_state.sql", "utf8");
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /No direct client access to app state/i);
});
