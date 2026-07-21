import dotenv from "dotenv";
import pg from "pg";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL(".env", import.meta.url)),
  quiet: true,
});

const { Pool } = pg;

const REQUIRED_TABLES = [
  "users",
  "medications",
  "drug_gene_rules",
  "patients",
  "patient_medications",
  "user_sessions",
  "pgx_results",
  "risk_results",
];

const REQUIRED_MEDICATIONS = [
  {
    genericName: "clopidogrel",
    brandName: "Plavix",
  },
  {
    genericName: "citalopram",
    brandName: "Celexa",
  },
  {
    genericName: "simvastatin",
    brandName: "Zocor",
  },
];

const CYP2C19_PHENOTYPES = [
  "poor metabolizer",
  "intermediate metabolizer",
  "normal metabolizer",
  "rapid metabolizer",
  "ultrarapid metabolizer",
];

const SLCO1B1_PHENOTYPES = [
  "normal function",
  "possible decreased function",
  "decreased function",
  "poor function",
];

const REQUIRED_RULES = [
  ...CYP2C19_PHENOTYPES.map((phenotype) => ({
    genericName: "clopidogrel",
    gene: "CYP2C19",
    phenotype,
  })),
  ...CYP2C19_PHENOTYPES.map((phenotype) => ({
    genericName: "citalopram",
    gene: "CYP2C19",
    phenotype,
  })),
  ...SLCO1B1_PHENOTYPES.map((phenotype) => ({
    genericName: "simvastatin",
    gene: "SLCO1B1",
    phenotype,
  })),
];

export function requireDatabaseUrl(env = process.env) {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required. Create backend\\.env with your local PostgreSQL connection string.",
    );
  }

  return env.DATABASE_URL;
}

function formatMedication(medication) {
  return `${medication.genericName} / ${medication.brandName}`;
}

function formatRule(rule) {
  return `${rule.genericName} + ${rule.gene} ${rule.phenotype}`;
}

async function getExistingTables(pool) {
  const { rows } = await pool.query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY($1)
    ORDER BY table_name;
    `,
    [REQUIRED_TABLES],
  );

  return new Set(rows.map((row) => row.table_name));
}

async function getMedicationRows(pool) {
  const { rows } = await pool.query(
    `
    SELECT id, generic_name, brand_name, is_active
    FROM medications
    WHERE lower(generic_name) = ANY($1)
    ORDER BY generic_name;
    `,
    [REQUIRED_MEDICATIONS.map((medication) => medication.genericName)],
  );

  return rows;
}

async function getRuleRows(pool) {
  const { rows } = await pool.query(
    `
    SELECT
      lower(m.generic_name) AS generic_name,
      upper(r.gene) AS gene,
      lower(r.phenotype) AS phenotype
    FROM drug_gene_rules r
    JOIN medications m ON m.id = r.medication_id
    WHERE lower(m.generic_name) = ANY($1)
      AND upper(r.gene) = ANY($2)
      AND lower(r.phenotype) = ANY($3);
    `,
    [
      REQUIRED_RULES.map((rule) => rule.genericName),
      [...new Set(REQUIRED_RULES.map((rule) => rule.gene))],
      [...new Set(REQUIRED_RULES.map((rule) => rule.phenotype))],
    ],
  );

  return rows;
}

export async function verifyMvpData(pool) {
  const failures = [];
  const passed = [];

  const existingTables = await getExistingTables(pool);
  const missingTables = REQUIRED_TABLES.filter((table) => !existingTables.has(table));

  if (missingTables.length > 0) {
    failures.push(`Missing required tables: ${missingTables.join(", ")}`);
    return { ok: false, passed, failures };
  }

  passed.push("Required tables exist.");

  const medicationRows = await getMedicationRows(pool);
  const medicationsByGenericName = new Map(
    medicationRows.map((row) => [String(row.generic_name).toLowerCase(), row]),
  );

  for (const medication of REQUIRED_MEDICATIONS) {
    const row = medicationsByGenericName.get(medication.genericName);

    if (!row) {
      failures.push(`Missing MVP medication: ${formatMedication(medication)}`);
      continue;
    }

    if (!row.id) {
      failures.push(`Medication is missing id: ${formatMedication(medication)}`);
    }

    if (String(row.brand_name || "").toLowerCase() !== medication.brandName.toLowerCase()) {
      failures.push(`Medication has unexpected brand name: ${formatMedication(medication)}`);
    }

    if (row.is_active !== true) {
      failures.push(`Medication is not active: ${formatMedication(medication)}`);
    }
  }

  if (!REQUIRED_MEDICATIONS.some((medication) =>
    !medicationsByGenericName.has(medication.genericName)
  )) {
    passed.push("MVP medications exist with active rows and IDs.");
  }

  const ruleRows = await getRuleRows(pool);
  const ruleKeys = new Set(
    ruleRows.map((row) => `${row.generic_name}|${row.gene}|${row.phenotype}`),
  );

  for (const rule of REQUIRED_RULES) {
    const key = `${rule.genericName}|${rule.gene}|${rule.phenotype}`;

    if (!ruleKeys.has(key)) {
      failures.push(`Missing MVP drug-gene rule: ${formatRule(rule)}`);
    }
  }

  if (REQUIRED_RULES.every((rule) =>
    ruleKeys.has(`${rule.genericName}|${rule.gene}|${rule.phenotype}`)
  )) {
    passed.push(
      `Required MVP drug-gene rules exist (${REQUIRED_RULES.length} phenotype rules).`,
    );
  }

  return {
    ok: failures.length === 0,
    passed,
    failures,
  };
}

async function main() {
  let pool;

  try {
    const databaseUrl = requireDatabaseUrl();
    pool = new Pool({ connectionString: databaseUrl });

    const result = await verifyMvpData(pool);

    console.log("Medune MVP data verification");
    for (const item of result.passed) {
      console.log(`PASS: ${item}`);
    }

    if (!result.ok) {
      for (const item of result.failures) {
        console.error(`FAIL: ${item}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log("PASS: MVP database is ready for medication search.");
  } catch (error) {
    console.error(error.message || "MVP data verification failed.");
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] === currentFile) {
  await main();
}
