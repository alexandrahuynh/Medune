import assert from "node:assert/strict";
import test from "node:test";
import { getPgxResults, savePgxResult } from "./pgxResults.js";

const patientId = "756bd410-d6e5-427b-89aa-d86c4b82d2d9";
const pgxResultId = "3f27ba56-80a1-4ee7-924f-0d6adcea4e3f";

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

test("getPgxResults returns mapped rows for a patient", async () => {
  const pool = createPool([
    {
      match: (sql) => /FROM patients/i.test(sql),
      run: () => ({ rows: [{ id: patientId }] }),
    },
    {
      match: (sql) => /FROM pgx_results/i.test(sql),
      run: (_sql, values) => {
        assert.deepEqual(values, [patientId]);
        return {
          rows: [
            {
              id: pgxResultId,
              gene: "CYP2C19",
              phenotype: "poor metabolizer",
              genotype: "*2/*2",
              source: "manual_entry",
            },
          ],
        };
      },
    },
  ]);

  const response = await getPgxResults(pool, patientId);

  assert.equal(response.supported, true);
  assert.equal(response.results.length, 1);
  assert.equal(response.results[0].gene, "CYP2C19");
  assert.equal(response.results[0].phenotype, "poor metabolizer");
  assert.equal(response.results[0].genotype, "*2/*2");
});

test("savePgxResult upserts and returns the saved result", async () => {
  const pool = createPool([
    {
      match: (sql) => /FROM patients/i.test(sql),
      run: () => ({ rows: [{ id: patientId }] }),
    },
    {
      match: (sql) => /INSERT INTO pgx_results/i.test(sql),
      run: (sql, values) => {
        assert.match(sql, /ON CONFLICT \(patient_id, gene\)/);
        assert.equal(values[0], patientId);
        assert.equal(values[1], "SLCO1B1");
        assert.equal(values[2], "decreased function");
        assert.equal(values[3], "*5/*5");
        return {
          rows: [
            {
              id: pgxResultId,
              gene: "SLCO1B1",
              phenotype: "decreased function",
              genotype: "*5/*5",
              source: "manual_entry",
            },
          ],
        };
      },
    },
  ]);

  const response = await savePgxResult(pool, patientId, {
    gene: "SLCO1B1",
    phenotype: "decreased function",
    genotype: "*5/*5",
  });

  assert.equal(response.supported, true);
  assert.equal(response.result.gene, "SLCO1B1");
  assert.equal(response.result.phenotype, "decreased function");
});

test("savePgxResult requires gene and phenotype", async () => {
  let called = false;
  const pool = {
    query: async () => {
      called = true;
      return { rows: [] };
    },
  };

  const response = await savePgxResult(pool, patientId, {
    gene: "CYP2C19",
    phenotype: "  ",
  });

  assert.equal(called, false);
  assert.equal(response.supported, false);
  assert.match(response.message, /gene and phenotype/i);
});
