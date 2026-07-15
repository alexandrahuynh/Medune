const MISSING_IDS_MESSAGE = "Provide both patientId and medicationId.";
const UNSUPPORTED_MESSAGE = "This medication is not supported in the MVP yet.";
const PATIENT_NOT_FOUND_MESSAGE = "Patient was not found.";
const INSUFFICIENT_DATA_MESSAGE =
  "Not enough genetic results are available to evaluate this medication yet.";

const INSUFFICIENT_PATIENT_SUMMARY =
  "There is not enough genetic information on file to assess this medication yet.";
const INSUFFICIENT_CLINICIAN_SUMMARY =
  "No approved drug-gene rule matched the patient's available PGx results.";
const INSUFFICIENT_RECOMMENDED_ACTION =
  "Consider ordering relevant pharmacogenetic testing before deciding on this medication.";

function mapMedication(row) {
  return {
    id: row.id,
    genericName: row.generic_name,
    brandName: row.brand_name,
    drugClass: row.drug_class,
  };
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function findMatchingRule(rules, pgxResults) {
  for (const rule of rules) {
    const matchingPgx = pgxResults.find(
      (pgx) =>
        normalize(pgx.gene) === normalize(rule.gene) &&
        normalize(pgx.phenotype) === normalize(rule.phenotype),
    );

    if (matchingPgx) {
      return { rule, pgx: matchingPgx };
    }
  }

  return null;
}

async function saveRiskResult(pool, values) {
  const { rows } = await pool.query(
    `
    INSERT INTO risk_results (
      patient_id,
      medication_id,
      pgx_result_id,
      rule_id,
      risk_level,
      patient_summary,
      clinician_summary,
      recommended_action
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id;
    `,
    [
      values.patientId,
      values.medicationId,
      values.pgxResultId,
      values.ruleId,
      values.riskLevel,
      values.patientSummary,
      values.clinicianSummary,
      values.recommendedAction,
    ],
  );

  return rows[0].id;
}

export async function matchRules(pool, { patientId, medicationId } = {}) {
  const cleanPatientId = String(patientId || "").trim();
  const cleanMedicationId = String(medicationId || "").trim();

  if (!cleanPatientId || !cleanMedicationId) {
    return {
      supported: false,
      matched: false,
      message: MISSING_IDS_MESSAGE,
    };
  }

  const { rows: medicationRows } = await pool.query(
    `
    SELECT id, generic_name, brand_name, drug_class
    FROM medications
    WHERE id = $1
      AND is_active = true;
    `,
    [cleanMedicationId],
  );

  if (medicationRows.length === 0) {
    return {
      supported: false,
      matched: false,
      message: UNSUPPORTED_MESSAGE,
    };
  }

  const medication = medicationRows[0];

  const { rows: patientRows } = await pool.query(
    `
    SELECT id
    FROM patients
    WHERE id = $1;
    `,
    [cleanPatientId],
  );

  if (patientRows.length === 0) {
    return {
      supported: false,
      matched: false,
      message: PATIENT_NOT_FOUND_MESSAGE,
    };
  }

  const { rows: rules } = await pool.query(
    `
    SELECT
      id,
      gene,
      phenotype,
      risk_level,
      patient_summary,
      clinician_summary,
      recommended_action,
      evidence_source
    FROM drug_gene_rules
    WHERE medication_id = $1
      AND review_status = 'approved';
    `,
    [cleanMedicationId],
  );

  const { rows: pgxResults } = await pool.query(
    `
    SELECT id, gene, phenotype
    FROM pgx_results
    WHERE patient_id = $1;
    `,
    [cleanPatientId],
  );

  const match = findMatchingRule(rules, pgxResults);

  if (match) {
    const riskResultId = await saveRiskResult(pool, {
      patientId: cleanPatientId,
      medicationId: cleanMedicationId,
      pgxResultId: match.pgx.id,
      ruleId: match.rule.id,
      riskLevel: match.rule.risk_level,
      patientSummary: match.rule.patient_summary,
      clinicianSummary: match.rule.clinician_summary,
      recommendedAction: match.rule.recommended_action,
    });

    return {
      supported: true,
      matched: true,
      riskLevel: match.rule.risk_level,
      medication: mapMedication(medication),
      gene: match.rule.gene,
      phenotype: match.rule.phenotype,
      patientSummary: match.rule.patient_summary,
      clinicianSummary: match.rule.clinician_summary,
      recommendedAction: match.rule.recommended_action,
      evidenceSource: match.rule.evidence_source,
      ruleId: match.rule.id,
      pgxResultId: match.pgx.id,
      riskResultId,
    };
  }

  const riskResultId = await saveRiskResult(pool, {
    patientId: cleanPatientId,
    medicationId: cleanMedicationId,
    pgxResultId: null,
    ruleId: null,
    riskLevel: "insufficient_data",
    patientSummary: INSUFFICIENT_PATIENT_SUMMARY,
    clinicianSummary: INSUFFICIENT_CLINICIAN_SUMMARY,
    recommendedAction: INSUFFICIENT_RECOMMENDED_ACTION,
  });

  return {
    supported: true,
    matched: false,
    riskLevel: "insufficient_data",
    medication: mapMedication(medication),
    gene: null,
    phenotype: null,
    patientSummary: INSUFFICIENT_PATIENT_SUMMARY,
    clinicianSummary: INSUFFICIENT_CLINICIAN_SUMMARY,
    recommendedAction: INSUFFICIENT_RECOMMENDED_ACTION,
    evidenceSource: null,
    ruleId: null,
    pgxResultId: null,
    riskResultId,
    message: INSUFFICIENT_DATA_MESSAGE,
  };
}
