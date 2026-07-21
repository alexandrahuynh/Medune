import assert from "node:assert/strict";
import test from "node:test";
import {
  addPatientMedication,
  listPatientMedications,
  removePatientMedication,
  updatePatientMedication,
} from "./patientMedications.js";

const patientId = "756bd410-d6e5-427b-89aa-d86c4b82d2d9";
const medicationId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";

function poolWith(responses) {
  let index = 0;
  return { query: async () => responses[index++]() };
}

test("listing several medications preserves stable item ids and does not invent safety data", async () => {
  const pool = poolWith([() => ({ rows: [
    { id: "list-1", medication_id: "med-1", generic_name: "clopidogrel", brand_name: "Plavix", drug_class: "antiplatelet", status: "active", notes: null },
    { id: "list-2", medication_id: "med-2", generic_name: "simvastatin", brand_name: "Zocor", drug_class: "statin", status: "considering", notes: "Discuss" },
  ] })]);
  const result = await listPatientMedications(pool, patientId);
  assert.deepEqual(result.results.map((item) => item.id), ["list-1", "list-2"]);
  assert.deepEqual(result.results[0].safety.sideEffects, []);
  assert.equal(result.results[0].assessment.score, null);
  assert.equal(result.results[0].assessment.level, "unknown");
});

test("adding a medication returns its persistent list-item id", async () => {
  const pool = poolWith([() => ({ rows: [{ id: medicationId }] }), () => ({ rows: [{ id: itemId }] })]);
  const result = await addPatientMedication(pool, patientId, medicationId);
  assert.equal(result.supported, true);
  assert.equal(result.id, itemId);
});

test("duplicate medication constraint returns a clear warning", async () => {
  const pool = poolWith([() => ({ rows: [{ id: medicationId }] }), () => { const error = new Error("duplicate"); error.code = "23505"; throw error; }]);
  const result = await addPatientMedication(pool, patientId, medicationId);
  assert.equal(result.code, "DUPLICATE_MEDICATION");
  assert.match(result.message, /already/i);
});

test("updating validates status and persists editable fields", async () => {
  const invalid = await updatePatientMedication({ query: async () => assert.fail() }, patientId, itemId, { status: "unknown", notes: "" });
  assert.equal(invalid.code, "INVALID_INPUT");
  const pool = poolWith([() => ({ rows: [{ id: itemId }] })]);
  const result = await updatePatientMedication(pool, patientId, itemId, { status: "past", notes: "Archived" });
  assert.equal(result.supported, true);
});

test("removing a medication is scoped to patient and item id", async () => {
  const pool = poolWith([() => ({ rows: [{ id: itemId }] })]);
  const result = await removePatientMedication(pool, patientId, itemId);
  assert.equal(result.supported, true);
  assert.equal(result.id, itemId);
});
