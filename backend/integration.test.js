import assert from "node:assert/strict";
import test from "node:test";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("authenticated medication HTTP workflow persists and isolates users", { skip: !databaseUrl }, async () => {
  const { pool } = await import("./db.js");
  const { createApp } = await import("./app.js");
  await pool.query(`INSERT INTO medications (generic_name, brand_name, drug_class)
    VALUES ('clopidogrel', 'Plavix', 'antiplatelet') ON CONFLICT (generic_name) DO UPDATE SET is_active = true`);

  let server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const origin = "http://localhost:5173";
  const base = () => `http://127.0.0.1:${server.address().port}`;
  async function request(path, options = {}) {
    return fetch(`${base()}${path}`, { ...options, headers: { Origin: origin, "Content-Type": "application/json", ...options.headers } });
  }
  async function createSession(email) {
    let response = await request("/api/auth/register", { method: "POST", body: JSON.stringify({ firstName: "Test", lastName: "User", email, password: "integration-password" }) });
    assert.equal(response.status, 201);
    response = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password: "integration-password" }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    return { cookie: response.headers.get("set-cookie").split(";")[0], csrf: body.csrfToken };
  }

  try {
    const sessionA = await createSession("integration-a@example.com");
    const sessionB = await createSession("integration-b@example.com");
    const search = await (await request("/api/medications/search?q=clopidogrel")).json();
    const medicationId = search.results[0].id;
    const authHeaders = (session) => ({ Cookie: session.cookie, "X-CSRF-Token": session.csrf });

    let response = await request("/api/patients/me/medications", { method: "POST", headers: authHeaders(sessionA), body: JSON.stringify({ medicationId }) });
    assert.equal(response.status, 201);
    response = await request("/api/patients/me/medications", { method: "POST", headers: authHeaders(sessionA), body: JSON.stringify({ medicationId }) });
    assert.equal(response.status, 409);

    const listA = await (await request("/api/patients/me/medications", { headers: authHeaders(sessionA) })).json();
    const listB = await (await request("/api/patients/me/medications", { headers: authHeaders(sessionB) })).json();
    assert.equal(listA.results.length, 1);
    assert.equal(listB.results.length, 0);
    assert.equal((await request(`/api/patients/${listA.results[0].id}/medications`, { headers: authHeaders(sessionB) })).status, 404);

    await new Promise((resolve) => server.close(resolve));
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const afterRestart = await (await request("/api/patients/me/medications", { headers: authHeaders(sessionA) })).json();
    assert.equal(afterRestart.results.length, 1);

    response = await request(`/api/patients/me/medications/${afterRestart.results[0].id}`, { method: "PATCH", headers: authHeaders(sessionA), body: JSON.stringify({ status: "past", notes: "Persisted" }) });
    assert.equal(response.status, 200);
    response = await request(`/api/patients/me/medications/${afterRestart.results[0].id}`, { method: "DELETE", headers: authHeaders(sessionA) });
    assert.equal(response.status, 200);
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
