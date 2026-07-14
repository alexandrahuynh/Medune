import assert from "node:assert/strict";
import test from "node:test";
import { requireDatabaseUrl, verifyMvpData } from "./verifyMvpData.js";

test("missing DATABASE_URL fails with a safe setup message", () => {
  assert.throws(
    () => requireDatabaseUrl({}),
    /DATABASE_URL is required\. Create backend\\\.env/,
  );
});

test("verification reports missing required tables", async () => {
  const pool = {
    query: async () => ({ rows: [] }),
  };

  const result = await verifyMvpData(pool);

  assert.equal(result.ok, false);
  assert.match(result.failures[0], /Missing required tables/);
});

test("verification reports missing medications and rules clearly", async () => {
  const pool = {
    query: async (sql) => {
      if (sql.includes("information_schema.tables")) {
        return {
          rows: [
            { table_name: "medications" },
            { table_name: "drug_gene_rules" },
            { table_name: "patients" },
            { table_name: "pgx_results" },
            { table_name: "risk_results" },
          ],
        };
      }

      return { rows: [] };
    },
  };

  const result = await verifyMvpData(pool);

  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes("Missing MVP medication")));
  assert.ok(result.failures.some((failure) => failure.includes("Missing MVP drug-gene rule")));
});
