import assert from "node:assert/strict";
import test from "node:test";
import { authenticateToken, hashPassword, hashToken, loginAccount, registerAccount, verifyPassword } from "./auth.js";
import { createAuthenticationMiddleware } from "./middleware/authentication.js";
import { createCsrfToken, requireCsrf, requireTrustedOrigin } from "./middleware/requestSecurity.js";
import { clearThrottleForTests, loginThrottle } from "./middleware/authThrottle.js";

test("password hashes verify without storing plaintext", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.doesNotMatch(hash, /correct horse/);
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
});

test("registration rejects oversized passwords before database work", async () => {
  const pool = { connect: async () => assert.fail("database should not be used") };
  const result = await registerAccount(pool, { email: "a@example.com", firstName: "A", lastName: "User", password: "x".repeat(129) });
  assert.equal(result.code, "INVALID_INPUT");
  assert.match(result.message, /128/);
});

test("authentication derives patient ownership only from the bearer token", async () => {
  const patientA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const pool = {
    query: async (_sql, values) => {
      assert.deepEqual(values, [hashToken("token-for-a")]);
      return { rows: [{ user_id: "user-a", patient_id: patientA, email: "a@example.com" }] };
    },
  };
  const auth = await authenticateToken(pool, "token-for-a");
  assert.equal(auth.patient_id, patientA);
  assert.equal(Object.hasOwn(auth, "requested_patient_id"), false);
});

test("login creates a hashed session tied to the account's patient", async () => {
  const passwordHash = await hashPassword("correct horse battery staple");
  const calls = [];
  const pool = { query: async (sql, values) => {
    calls.push({ sql, values });
    if (/FROM users/i.test(sql)) return { rows: [{ user_id: "user-a", patient_id: "patient-a", email: "a@example.com", first_name: "A", last_name: "User", password_hash: passwordHash }] };
    return { rows: [] };
  } };
  const result = await loginAccount(pool, { email: "A@example.com", password: "correct horse battery staple" });
  assert.equal(result.supported, true);
  assert.equal(result.user.patientId, "patient-a");
  assert.ok(result.token.length > 30);
  assert.match(calls[1].sql, /DELETE FROM user_sessions/);
  assert.match(calls[2].sql, /ON CONFLICT \(user_id\) DO UPDATE/);
  assert.equal(calls[2].values[1], hashToken(result.token));
  assert.notEqual(calls[2].values[1], result.token);
});

test("missing bearer tokens are rejected without querying the database", async () => {
  const pool = { query: async () => assert.fail("database should not be queried") };
  assert.equal(await authenticateToken(pool, ""), null);
});

test("authentication middleware rejects unauthenticated requests with 401", async () => {
  const middleware = createAuthenticationMiddleware({}, async () => null);
  const req = { headers: {} };
  const response = { statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await middleware(req, response, () => assert.fail("next should not run"));
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, "Unauthorized");
});

test("authentication middleware ignores caller patient data and attaches session ownership", async () => {
  const ownedPatient = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const middleware = createAuthenticationMiddleware({}, async () => ({ patient_id: ownedPatient }));
  const req = { headers: { cookie: "medune_session=valid" }, params: { patientId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } };
  let called = false;
  await middleware(req, {}, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.auth.patient_id, ownedPatient);
  assert.notEqual(req.auth.patient_id, req.params.patientId);
});

function responseRecorder() {
  return { statusCode: 0, body: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, setHeader(name, value) { this.headers[name] = value; } };
}

test("trusted-origin middleware rejects missing and unapproved origins", () => {
  for (const origin of [undefined, "https://attacker.example"]) {
    const response = responseRecorder();
    requireTrustedOrigin({ headers: { origin } }, response, () => assert.fail("next should not run"));
    assert.equal(response.statusCode, 403);
  }
  let called = false;
  requireTrustedOrigin({ headers: { origin: "http://localhost:5173" } }, responseRecorder(), () => { called = true; });
  assert.equal(called, true);
});

test("CSRF middleware requires a token bound to the session cookie", () => {
  const token = "session-token";
  for (const csrf of [undefined, "wrong-token"]) {
    const response = responseRecorder();
    requireCsrf({ headers: { cookie: `medune_session=${token}`, "x-csrf-token": csrf } }, response, () => assert.fail("next should not run"));
    assert.equal(response.statusCode, 403);
  }
  let called = false;
  requireCsrf({ headers: { cookie: `medune_session=${token}`, "x-csrf-token": createCsrfToken(token) } }, responseRecorder(), () => { called = true; });
  assert.equal(called, true);
});

test("login throttling rejects repeated attempts", () => {
  clearThrottleForTests();
  const req = { ip: "127.0.0.1", body: { email: "a@example.com" } };
  for (let index = 0; index < 5; index += 1) loginThrottle(req, responseRecorder(), () => {});
  const response = responseRecorder();
  loginThrottle(req, response, () => assert.fail("next should not run"));
  assert.equal(response.statusCode, 429);
  assert.equal(response.headers["Retry-After"], "900");
});
