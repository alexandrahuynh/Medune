const MISSING_IDS_MESSAGE = "Provide both patientId and medicationId.";
const UNSUPPORTED_MESSAGE = "This medication is not supported in the MVP yet.";
const PATIENT_NOT_FOUND_MESSAGE = "Patient was not found.";
const NO_RULES_MESSAGE = "No approved drug-gene rules found for this medication.";
const NO_PGX_DATA_MESSAGE =
  "No PGx data found. Please add your genetic result before checking medication risk.";
const NO_MATCHING_RULE_MESSAGE =
  "No matching drug-gene rule was found for this medication and your saved PGx results.";
const MATCH_FOUND_MESSAGE = "Medication risk result found.";

const NO_PGX_PATIENT_SUMMARY =
  "No pharmacogenetic results are on file for this patient yet.";
const NO_PGX_CLINICIAN_SUMMARY =
  "Medication risk cannot be evaluated until the patient has at least one saved PGx result.";
const NO_PGX_RECOMMENDED_ACTION =
  "Add a gene and phenotype result before checking medication risk.";

const INSUFFICIENT_PATIENT_SUMMARY =
  "There is not enough matching genetic information on file to assess this medication yet.";
const INSUFFICIENT_CLINICIAN_SUMMARY =
  "No approved drug-gene rule matched the patient's available PGx results.";
const INSUFFICIENT_RECOMMENDED_ACTION =
  "Review this result with a clinician before making medication changes.";

const RISK_PRIORITY = {
  potential_concern: 4,
  caution: 3,
  low_risk: 2,
  insufficient_data: 1,
};

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

function buildRequiredGenes(rules) {
  const genes = [];
  const seen = new Set();

  for (const rule of rules) {
    const key = normalize(rule.gene);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    genes.push(rule.gene);
  }

  return genes;
}

function getMissingGenes(requiredGenes, pgxResults) {
  const patientGenes = new Set(pgxResults.map((row) => normalize(row.gene)));

  return requiredGenes.filter((gene) => !patientGenes.has(normalize(gene)));
}

function filterRelevantPgxResults(pgxResults, requiredGenes) {
  const required = new Set(requiredGenes.map((gene) => normalize(gene)));

  return pgxResults.filter((row) => required.has(normalize(row.gene)));
}

function findAllMatches(rules, pgxResults) {
  const matches = [];

  for (const rule of rules) {
    const pgx = pgxResults.find(
      (row) =>
        normalize(row.gene) === normalize(rule.gene) &&
        normalize(row.phenotype) === normalize(rule.phenotype),
    );

    if (pgx) {
      matches.push({ rule, pgx });
    }
  }

  return matches;
}

function compareRiskLevels(a, b) {
  return (RISK_PRIORITY[b] || 0) - (RISK_PRIORITY[a] || 0);
}

function getOverallRiskLevel(matches) {
  return matches
    .map((match) => match.rule.risk_level)
    .sort(compareRiskLevels)[0];
}

function formatMissingGeneMessage(missingGenes) {
  if (missingGenes.length === 1) {
    return `Missing ${missingGenes[0]} PGx result for this medication.`;
  }

  return `Missing ${missingGenes.join(", ")} PGx results for this medication.`;
}

function mapMatchSummary(match, riskResultId) {
  return {
    gene: match.rule.gene,
    phenotype: match.rule.phenotype,
    riskLevel: match.rule.risk_level,
    patientSummary: match.rule.patient_summary,
    clinicianSummary: match.rule.clinician_summary,
    recommendedAction: match.rule.recommended_action,
    evidenceSource: match.rule.evidence_source,
    ruleId: match.rule.id,
    pgxResultId: match.pgx.id,
    riskResultId,
  };
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

async function saveInsufficientRiskResult(pool, values) {
  return saveRiskResult(pool, {
    patientId: values.patientId,
    medicationId: values.medicationId,
    pgxResultId: null,
    ruleId: null,
    riskLevel: "insufficient_data",
    patientSummary: values.patientSummary,
    clinicianSummary: values.clinicianSummary,
    recommendedAction: values.recommendedAction,
  });
}

function buildInsufficientResponse({
  medication,
  message,
  missingGenes = [],
  patientSummary = INSUFFICIENT_PATIENT_SUMMARY,
  clinicianSummary = INSUFFICIENT_CLINICIAN_SUMMARY,
  recommendedAction = INSUFFICIENT_RECOMMENDED_ACTION,
  riskResultId = null,
}) {
  return {
    supported: true,
    matched: false,
    status: "insufficient_data",
    riskLevel: "insufficient_data",
    medication: mapMedication(medication),
    message,
    missingGenes,
    matches: [],
    gene: null,
    phenotype: null,
    patientSummary,
    clinicianSummary,
    recommendedAction,
    evidenceSource: null,
    ruleId: null,
    pgxResultId: null,
    riskResultId,
  };
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

  if (rules.length === 0) {
    const riskResultId = await saveInsufficientRiskResult(pool, {
      patientId: cleanPatientId,
      medicationId: cleanMedicationId,
      patientSummary: INSUFFICIENT_PATIENT_SUMMARY,
      clinicianSummary: NO_RULES_MESSAGE,
      recommendedAction: INSUFFICIENT_RECOMMENDED_ACTION,
    });

    return buildInsufficientResponse({
      medication,
      message: NO_RULES_MESSAGE,
      patientSummary: INSUFFICIENT_PATIENT_SUMMARY,
      clinicianSummary: NO_RULES_MESSAGE,
      recommendedAction: INSUFFICIENT_RECOMMENDED_ACTION,
      riskResultId,
    });
  }

  const requiredGenes = buildRequiredGenes(rules);

  const { rows: pgxResults } = await pool.query(
    `
    SELECT id, gene, phenotype
    FROM pgx_results
    WHERE patient_id = $1;
    `,
    [cleanPatientId],
  );

  if (pgxResults.length === 0) {
    const riskResultId = await saveInsufficientRiskResult(pool, {
      patientId: cleanPatientId,
      medicationId: cleanMedicationId,
      patientSummary: NO_PGX_PATIENT_SUMMARY,
      clinicianSummary: NO_PGX_CLINICIAN_SUMMARY,
      recommendedAction: NO_PGX_RECOMMENDED_ACTION,
    });

    return buildInsufficientResponse({
      medication,
      message: NO_PGX_DATA_MESSAGE,
      missingGenes: requiredGenes,
      patientSummary: NO_PGX_PATIENT_SUMMARY,
      clinicianSummary: NO_PGX_CLINICIAN_SUMMARY,
      recommendedAction: NO_PGX_RECOMMENDED_ACTION,
      riskResultId,
    });
  }

  const missingGenes = getMissingGenes(requiredGenes, pgxResults);

  if (missingGenes.length > 0) {
    const riskResultId = await saveInsufficientRiskResult(pool, {
      patientId: cleanPatientId,
      medicationId: cleanMedicationId,
      patientSummary: INSUFFICIENT_PATIENT_SUMMARY,
      clinicianSummary: formatMissingGeneMessage(missingGenes),
      recommendedAction: INSUFFICIENT_RECOMMENDED_ACTION,
    });

    return buildInsufficientResponse({
      medication,
      message: formatMissingGeneMessage(missingGenes),
      missingGenes,
      riskResultId,
    });
  }

  const relevantPgxResults = filterRelevantPgxResults(pgxResults, requiredGenes);
  const matches = findAllMatches(rules, relevantPgxResults);

  if (matches.length === 0) {
    const riskResultId = await saveInsufficientRiskResult(pool, {
      patientId: cleanPatientId,
      medicationId: cleanMedicationId,
      patientSummary: INSUFFICIENT_PATIENT_SUMMARY,
      clinicianSummary: INSUFFICIENT_CLINICIAN_SUMMARY,
      recommendedAction: INSUFFICIENT_RECOMMENDED_ACTION,
    });

    return buildInsufficientResponse({
      medication,
      message: NO_MATCHING_RULE_MESSAGE,
      missingGenes: [],
      riskResultId,
    });
  }

  const sortedMatches = [...matches].sort((a, b) =>
    compareRiskLevels(a.rule.risk_level, b.rule.risk_level),
  );
  const overallRiskLevel = getOverallRiskLevel(sortedMatches);
  const matchSummaries = [];

  for (const match of sortedMatches) {
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

    matchSummaries.push(mapMatchSummary(match, riskResultId));
  }

  const primaryMatch = matchSummaries[0];

  return {
    supported: true,
    matched: true,
    status: "matched",
    riskLevel: overallRiskLevel,
    medication: mapMedication(medication),
    message: MATCH_FOUND_MESSAGE,
    missingGenes: [],
    matches: matchSummaries,
    gene: primaryMatch.gene,
    phenotype: primaryMatch.phenotype,
    patientSummary: primaryMatch.patientSummary,
    clinicianSummary: primaryMatch.clinicianSummary,
    recommendedAction: primaryMatch.recommendedAction,
    evidenceSource: primaryMatch.evidenceSource,
    ruleId: primaryMatch.ruleId,
    pgxResultId: primaryMatch.pgxResultId,
    riskResultId: primaryMatch.riskResultId,
  };
}
