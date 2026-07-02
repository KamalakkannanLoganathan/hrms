import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("production deployment assets are present", () => {
  assert.equal(existsSync("Dockerfile"), true);
  assert.equal(existsSync("docker-compose.yml"), true);
  assert.equal(existsSync("deploy/nginx-hrms.terimarevenue.com.conf"), true);
});

test("docker compose targets the hrms subdomain", () => {
  const compose = readFileSync("docker-compose.yml", "utf8");
  assert.match(compose, /https:\/\/hrms\.terimarevenue\.com/);
});

test("supabase migration removes direct browser access through RLS", () => {
  const migration = readFileSync("supabase/migrations/001_hrms_app_state.sql", "utf8");
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /No direct client access to app state/i);
});
