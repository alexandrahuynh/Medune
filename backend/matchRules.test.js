import assert from "node:assert/strict";
import test from "node:test";
import { matchRules } from "./matchRules.js";

const patientId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const medicationId = "11111111-1111-1111-1111-111111111111";
const ruleId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const pgxResultId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const riskResultId = "dddddddd-dddd-dddd-dddd-dddddddddddd";

const medicationRow = {
  id: medicationId,
  generic_name: "clopidogrel",
  brand_name: "Plavix",
  drug_class: "antiplatelet",
};

const approvedRuleRow = {
  id: ruleId,
  gene: "CYP2C19",
  phenotype: "poor metabolizer",
  risk_level: "potential_concern",
  patient_summary: "This medication may not work well for you.",
  clinician_summary: "Consider an alternative antiplatelet.",
  recommended_action: "Discuss alternatives with a clinician.",
  evidence_source: "CPIC",
};

const matchingPgxRow = {
  id: pgxResultId,
  gene: "cyp2c19",
  phenotype: "Poor Metabolizer",
};

function createPool(handlers) {
  const calls = [];

  return {
    calls,
    query: async (sql, values = []) => {
      calls.push({ sql, values });

      for (const handler of handlers) {
        if (handler.match(sql)) {
          return handler.run(sql, values);
        }
      }

      throw new Error(`Unexpected SQL in test:\n${sql}`);
    },
  };
}

test("missing ids returns a safe response without querying the database", async () => {
  let called = false;
  const pool = {
    query: async () => {
      called = true;
      return { rows: [] };
    },
  };

  const response = await matchRules(pool, {
    patientId: "  ",
    medicationId: "",
  });

  assert.equal(called, false);
  assert.equal(response.supported, false);
  assert.equal(response.matched, false);
  assert.match(response.message, /patientId and medicationId/i);
});

test("unknown medication returns unsupported without crashing", async () => {
  const pool = createPool([
    {
      match: (sql) => /FROM medications/i.test(sql),
      run: () => ({ rows: [] }),
    },
  ]);

  const response = await matchRules(pool, { patientId, medicationId });

  assert.equal(response.supported, false);
  assert.equal(response.matched, false);
  assert.match(response.message, /not supported/i);
  assert.equal(pool.calls.length, 1);
});

test("matching gene and phenotype returns risk details and saves risk_results", async () => {
  const pool = createPool([
    {
      match: (sql) => /FROM medications/i.test(sql),
      run: () => ({ rows: [medicationRow] }),
    },
    {
      match: (sql) => /FROM patients/i.test(sql),
      run: () => ({ rows: [{ id: patientId }] }),
    },
    {
      match: (sql) => /FROM drug_gene_rules/i.test(sql),
      run: (_sql, values) => {
        assert.deepEqual(values, [medicationId]);
        return { rows: [approvedRuleRow] };
      },
    },
    {
      match: (sql) => /FROM pgx_results/i.test(sql),
      run: (_sql, values) => {
        assert.deepEqual(values, [patientId]);
        return { rows: [matchingPgxRow] };
      },
    },
    {
      match: (sql) => /INSERT INTO risk_results/i.test(sql),
      run: (_sql, values) => {
        assert.equal(values[0], patientId);
        assert.equal(values[1], medicationId);
        assert.equal(values[2], pgxResultId);
        assert.equal(values[3], ruleId);
        assert.equal(values[4], "potential_concern");
        return { rows: [{ id: riskResultId }] };
      },
    },
  ]);

  const response = await matchRules(pool, { patientId, medicationId });

  assert.equal(response.supported, true);
  assert.equal(response.matched, true);
  assert.equal(response.riskLevel, "potential_concern");
  assert.equal(response.medication.genericName, "clopidogrel");
  assert.equal(response.gene, "CYP2C19");
  assert.equal(response.phenotype, "poor metabolizer");
  assert.equal(response.patientSummary, approvedRuleRow.patient_summary);
  assert.equal(response.clinicianSummary, approvedRuleRow.clinician_summary);
  assert.equal(response.recommendedAction, approvedRuleRow.recommended_action);
  assert.equal(response.evidenceSource, "CPIC");
  assert.equal(response.ruleId, ruleId);
  assert.equal(response.pgxResultId, pgxResultId);
  assert.equal(response.riskResultId, riskResultId);
  assert.equal(pool.calls.length, 5);
});

test("approved rules query filters by review_status = approved", async () => {
  let rulesSql = "";
  const pool = createPool([
    {
      match: (sql) => /FROM medications/i.test(sql),
      run: () => ({ rows: [medicationRow] }),
    },
    {
      match: (sql) => /FROM patients/i.test(sql),
      run: () => ({ rows: [{ id: patientId }] }),
    },
    {
      match: (sql) => /FROM drug_gene_rules/i.test(sql),
      run: (sql) => {
        rulesSql = sql;
        return { rows: [approvedRuleRow] };
      },
    },
    {
      match: (sql) => /FROM pgx_results/i.test(sql),
      run: () => ({ rows: [matchingPgxRow] }),
    },
    {
      match: (sql) => /INSERT INTO risk_results/i.test(sql),
      run: () => ({ rows: [{ id: riskResultId }] }),
    },
  ]);

  await matchRules(pool, { patientId, medicationId });

  assert.match(rulesSql, /review_status = 'approved'/);
});

test("missing needed PGx data returns insufficient_data and saves risk_results", async () => {
  const pool = createPool([
    {
      match: (sql) => /FROM medications/i.test(sql),
      run: () => ({ rows: [medicationRow] }),
    },
    {
      match: (sql) => /FROM patients/i.test(sql),
      run: () => ({ rows: [{ id: patientId }] }),
    },
    {
      match: (sql) => /FROM drug_gene_rules/i.test(sql),
      run: () => ({ rows: [approvedRuleRow] }),
    },
    {
      match: (sql) => /FROM pgx_results/i.test(sql),
      run: () => ({
        rows: [
          {
            id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
            gene: "CYP2C19",
            phenotype: "normal metabolizer",
          },
        ],
      }),
    },
    {
      match: (sql) => /INSERT INTO risk_results/i.test(sql),
      run: (_sql, values) => {
        assert.equal(values[2], null);
        assert.equal(values[3], null);
        assert.equal(values[4], "insufficient_data");
        assert.ok(values[5]);
        assert.ok(values[7]);
        return { rows: [{ id: riskResultId }] };
      },
    },
  ]);

  const response = await matchRules(pool, { patientId, medicationId });

  assert.equal(response.supported, true);
  assert.equal(response.matched, false);
  assert.equal(response.riskLevel, "insufficient_data");
  assert.equal(response.ruleId, null);
  assert.equal(response.pgxResultId, null);
  assert.equal(response.riskResultId, riskResultId);
  assert.match(response.message, /genetic results/i);
});

test("unknown patient returns a safe response", async () => {
  const pool = createPool([
    {
      match: (sql) => /FROM medications/i.test(sql),
      run: () => ({ rows: [medicationRow] }),
    },
    {
      match: (sql) => /FROM patients/i.test(sql),
      run: () => ({ rows: [] }),
    },
  ]);

  const response = await matchRules(pool, { patientId, medicationId });

  assert.equal(response.supported, false);
  assert.equal(response.matched, false);
  assert.match(response.message, /patient was not found/i);
  assert.equal(pool.calls.length, 2);
});
