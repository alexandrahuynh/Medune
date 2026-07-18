import assert from "node:assert/strict";
import test from "node:test";
import { resolvePatient } from "./patients.js";

const userId = "0b7a3d63-9d47-4a41-a2f7-5b9161c76a01";
const patientId = "756bd410-d6e5-427b-89aa-d86c4b82d2d9";

function createPool(handlers) {
  return {
    query: async (sql, values = []) => {
      for (const handler of handlers) {
        if (handler.match(sql)) {
          return handler.run(sql, values);
        }
      }

      throw new Error(`Unexpected SQL in test:\n${sql}`);
    },
  };
}

test("resolvePatient requires an email", async () => {
  let called = false;
  const pool = {
    query: async () => {
      called = true;
      return { rows: [] };
    },
  };

  const response = await resolvePatient(pool, { email: "  " });

  assert.equal(called, false);
  assert.equal(response.supported, false);
  assert.match(response.message, /email/i);
});

test("resolvePatient reuses an existing patient row", async () => {
  const pool = createPool([
    {
      match: (sql) => /INSERT INTO users/i.test(sql),
      run: (_sql, values) => {
        assert.deepEqual(values, ["demo@example.com"]);
        return { rows: [{ id: userId, email: "demo@example.com" }] };
      },
    },
    {
      match: (sql) => /SELECT id, first_name, last_name/i.test(sql),
      run: (_sql, values) => {
        assert.deepEqual(values, [userId]);
        return {
          rows: [{ id: patientId, first_name: "Demo", last_name: "User" }],
        };
      },
    },
  ]);

  const response = await resolvePatient(pool, {
    email: "  Demo@Example.com ",
    firstName: "Demo",
    lastName: "User",
  });

  assert.equal(response.supported, true);
  assert.equal(response.patientId, patientId);
  assert.equal(response.userId, userId);
  assert.equal(response.email, "demo@example.com");
});

test("resolvePatient creates a patient row when none exists", async () => {
  const pool = createPool([
    {
      match: (sql) => /INSERT INTO users/i.test(sql),
      run: () => ({ rows: [{ id: userId, email: "new@example.com" }] }),
    },
    {
      match: (sql) => /SELECT id, first_name, last_name/i.test(sql),
      run: () => ({ rows: [] }),
    },
    {
      match: (sql) => /INSERT INTO patients/i.test(sql),
      run: (_sql, values) => {
        assert.deepEqual(values, [userId, "Nina", "Kaur"]);
        return {
          rows: [{ id: patientId, first_name: "Nina", last_name: "Kaur" }],
        };
      },
    },
  ]);

  const response = await resolvePatient(pool, {
    email: "new@example.com",
    firstName: "Nina",
    lastName: "Kaur",
  });

  assert.equal(response.supported, true);
  assert.equal(response.patientId, patientId);
  assert.equal(response.firstName, "Nina");
});
