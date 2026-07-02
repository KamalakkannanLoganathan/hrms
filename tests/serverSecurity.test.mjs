import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY ||= "anon_test_key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service_role_test_key";
process.env.SUPABASE_STORAGE_BUCKET ||= "eagle-rcm-hr-private";
process.env.AUTH_SECRET ||= "test_secret_value_that_is_long_enough";

const server = await import("../server/production-server.mjs");

test("server validates required environment and accepts AUTH_SECRET", () => {
  const config = server.validateEnv();
  assert.equal(config.storageBucket, "eagle-rcm-hr-private");
});

test("signed session verifies and tampering is rejected", () => {
  const token = server.createSession({ id: "user_employee", employeeId: "emp_006", role: "EMPLOYEE" });
  const session = server.verifySession(token);
  assert.equal(session.userId, "user_employee");
  assert.equal(session.role, "EMPLOYEE");
  assert.equal(server.verifySession(`${token}tampered`), null);
});

test("csrf token is stable for a session and not empty", () => {
  const token = server.createSession({ id: "user_hr", employeeId: "emp_002", role: "HR_ADMIN" });
  const first = server.csrfToken(token);
  const second = server.csrfToken(token);
  assert.equal(first, second);
  assert.equal(first.length, 43);
});

test("state payload validation rejects malformed data", () => {
  assert.throws(() => server.validateStatePayload({}), /users must be an array/);
});
