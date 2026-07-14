import assert from "node:assert/strict";
import test from "node:test";
import { searchMedications } from "./searchMedications.js";

const medicationRow = {
  id: "11111111-1111-1111-1111-111111111111",
  generic_name: "clopidogrel",
  brand_name: "Plavix",
  drug_class: "antiplatelet",
};

test("search by generic name returns medication with id", async () => {
  const pool = {
    query: async () => ({ rows: [medicationRow] }),
  };

  const response = await searchMedications(pool, "clopidogrel");

  assert.equal(response.supported, true);
  assert.equal(response.results[0].id, medicationRow.id);
  assert.equal(response.results[0].genericName, "clopidogrel");
});

test("search by brand name uses parameterized case-insensitive SQL", async () => {
  let sql = "";
  let values = [];
  const pool = {
    query: async (queryText, queryValues) => {
      sql = queryText;
      values = queryValues;
      return { rows: [medicationRow] };
    },
  };

  await searchMedications(pool, "PLAVIX");

  assert.match(sql, /ILIKE \$1/);
  assert.match(sql, /is_active = true/);
  assert.deepEqual(values, ["%PLAVIX%"]);
});

test("unsupported search returns supported false", async () => {
  const pool = {
    query: async () => ({ rows: [] }),
  };

  const response = await searchMedications(pool, "Adderall");

  assert.equal(response.supported, false);
  assert.deepEqual(response.results, []);
  assert.match(response.message, /not supported/);
});

test("empty search returns safe response without querying database", async () => {
  let called = false;
  const pool = {
    query: async () => {
      called = true;
      return { rows: [] };
    },
  };

  const response = await searchMedications(pool, "   ");

  assert.equal(called, false);
  assert.equal(response.supported, false);
  assert.deepEqual(response.results, []);
});
