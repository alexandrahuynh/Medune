const MISSING_PATIENT_ID_MESSAGE = "Provide a patientId.";
const PATIENT_NOT_FOUND_MESSAGE = "Patient was not found.";
const MISSING_FIELDS_MESSAGE = "Provide both gene and phenotype.";

function mapPgxResult(row) {
  return {
    id: row.id,
    gene: row.gene,
    phenotype: row.phenotype,
    genotype: row.genotype,
    source: row.source,
  };
}

async function findPatient(pool, patientId) {
  const { rows } = await pool.query(
    `
    SELECT id
    FROM patients
    WHERE id = $1;
    `,
    [patientId],
  );

  return rows[0] || null;
}

export async function getPgxResults(pool, patientId) {
  const cleanPatientId = String(patientId || "").trim();

  if (!cleanPatientId) {
    return {
      supported: false,
      results: [],
      message: MISSING_PATIENT_ID_MESSAGE,
    };
  }

  const patient = await findPatient(pool, cleanPatientId);

  if (!patient) {
    return {
      supported: false,
      patientId: cleanPatientId,
      results: [],
      message: PATIENT_NOT_FOUND_MESSAGE,
    };
  }

  const { rows } = await pool.query(
    `
    SELECT id, gene, phenotype, genotype, source
    FROM pgx_results
    WHERE patient_id = $1
    ORDER BY gene ASC;
    `,
    [cleanPatientId],
  );

  return {
    supported: true,
    patientId: cleanPatientId,
    results: rows.map(mapPgxResult),
  };
}

export async function savePgxResult(pool, patientId, { gene, phenotype, genotype } = {}) {
  const cleanPatientId = String(patientId || "").trim();
  const cleanGene = String(gene || "").trim();
  const cleanPhenotype = String(phenotype || "").trim();
  const cleanGenotype = String(genotype || "").trim() || null;

  if (!cleanPatientId) {
    return {
      supported: false,
      message: MISSING_PATIENT_ID_MESSAGE,
    };
  }

  if (!cleanGene || !cleanPhenotype) {
    return {
      supported: false,
      message: MISSING_FIELDS_MESSAGE,
    };
  }

  const patient = await findPatient(pool, cleanPatientId);

  if (!patient) {
    return {
      supported: false,
      message: PATIENT_NOT_FOUND_MESSAGE,
    };
  }

  // One result per gene for a patient: update if that gene already exists.
  const { rows } = await pool.query(
    `
    INSERT INTO pgx_results (patient_id, gene, phenotype, genotype, source)
    VALUES ($1, $2, $3, $4, 'manual_entry')
    ON CONFLICT (patient_id, gene)
    DO UPDATE SET
      phenotype = EXCLUDED.phenotype,
      genotype = EXCLUDED.genotype,
      updated_at = now()
    RETURNING id, gene, phenotype, genotype, source;
    `,
    [cleanPatientId, cleanGene, cleanPhenotype, cleanGenotype],
  );

  return {
    supported: true,
    patientId: cleanPatientId,
    result: mapPgxResult(rows[0]),
  };
}
