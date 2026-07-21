import {
  getMedicationAssessment,
  getMedicationSafetyData,
} from "./medicationSafetyProvider.js";

const VALID_STATUSES = new Set(["active", "past", "considering"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapMedication(row) {
  const safety = getMedicationSafetyData(row.generic_name);
  return {
    id: row.id,
    medicationId: row.medication_id,
    genericName: row.generic_name,
    brandName: row.brand_name,
    drugClass: row.drug_class,
    status: row.status,
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    safety,
    assessment: getMedicationAssessment(),
  };
}

export async function listPatientMedications(pool, patientId) {
  const { rows } = await pool.query(
    `SELECT pm.id, pm.medication_id, pm.status, pm.notes, pm.created_at,
            pm.updated_at, m.generic_name, m.brand_name, m.drug_class
       FROM patient_medications pm
       JOIN medications m ON m.id = pm.medication_id
      WHERE pm.patient_id = $1
      ORDER BY pm.created_at ASC`,
    [patientId],
  );
  return { supported: true, results: rows.map(mapMedication) };
}

export async function addPatientMedication(pool, patientId, medicationId) {
  if (!UUID_PATTERN.test(patientId) || !UUID_PATTERN.test(medicationId)) {
    return { supported: false, code: "INVALID_INPUT", message: "Patient and medication are required." };
  }
  const medication = await pool.query(
    "SELECT id FROM medications WHERE id = $1 AND is_active = true",
    [medicationId],
  );
  if (medication.rows.length === 0) {
    return { supported: false, code: "MEDICATION_NOT_FOUND", message: "The medication was not found." };
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO patient_medications (patient_id, medication_id)
       VALUES ($1, $2)
       RETURNING id`,
      [patientId, medicationId],
    );
    return { supported: true, id: rows[0].id, message: "Medication added." };
  } catch (error) {
    if (error?.code === "23505") {
      return { supported: false, code: "DUPLICATE_MEDICATION", message: "This medication is already in your list." };
    }
    throw error;
  }
}

export async function updatePatientMedication(pool, patientId, itemId, input = {}) {
  const status = String(input.status || "").trim();
  const notes = String(input.notes || "").trim();
  if (!UUID_PATTERN.test(patientId) || !UUID_PATTERN.test(itemId) || !VALID_STATUSES.has(status) || notes.length > 500) {
    return { supported: false, code: "INVALID_INPUT", message: "Choose a valid status and keep notes under 500 characters." };
  }
  const { rows } = await pool.query(
    `UPDATE patient_medications SET status = $1, notes = $2, updated_at = now()
      WHERE id = $3 AND patient_id = $4 RETURNING id`,
    [status, notes || null, itemId, patientId],
  );
  if (rows.length === 0) {
    return { supported: false, code: "NOT_FOUND", message: "Medication list item was not found." };
  }
  return { supported: true, id: rows[0].id, message: "Medication updated." };
}

export async function removePatientMedication(pool, patientId, itemId) {
  if (!UUID_PATTERN.test(patientId) || !UUID_PATTERN.test(itemId)) {
    return { supported: false, code: "INVALID_INPUT", message: "A valid medication list item is required." };
  }
  const { rows } = await pool.query(
    "DELETE FROM patient_medications WHERE id = $1 AND patient_id = $2 RETURNING id",
    [itemId, patientId],
  );
  if (rows.length === 0) {
    return { supported: false, code: "NOT_FOUND", message: "Medication list item was not found." };
  }
  return { supported: true, id: rows[0].id, message: "Medication removed." };
}
