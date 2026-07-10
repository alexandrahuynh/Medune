CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  role text NOT NULL CHECK (role IN ('patient', 'clinician', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pgx_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  gene text NOT NULL,
  phenotype text NOT NULL,
  genotype text,
  source text NOT NULL DEFAULT 'manual_entry',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pgx_results_patient_gene UNIQUE (patient_id, gene)
);

CREATE TABLE IF NOT EXISTS medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generic_name text UNIQUE NOT NULL,
  brand_name text,
  drug_class text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- added 7/9
-- memory for patient medication
CREATE TABLE IF NOT EXISTS patient_medications (

  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) on DELETE CASCADE,
  medication_id uuid NOT NULL REFERENCES medications(id) on DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'past', 'considering')
  ),
  notes text,
  started_at date,
  stopped_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_patient_medication UNIQUE (patient_id, medication_id)

);

CREATE TABLE IF NOT EXISTS drug_gene_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid NOT NULL REFERENCES medications(id) ON DELETE RESTRICT,
  gene text NOT NULL,
  phenotype text NOT NULL,
  risk_level text NOT NULL CHECK (
    risk_level IN ('low_risk', 'caution', 'potential_concern', 'insufficient_data')
  ),
  patient_summary text NOT NULL,
  clinician_summary text NOT NULL,
  recommended_action text NOT NULL,
  evidence_source text NOT NULL,
  evidence_url text,
  rule_version text NOT NULL DEFAULT 'v1.0',
  review_status text NOT NULL DEFAULT 'pending_review' CHECK (
    review_status IN ('pending_review', 'approved', 'rejected')
  ),
  imported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_drug_gene_rules_med_gene_pheno UNIQUE (medication_id, gene, phenotype)
);

CREATE TABLE IF NOT EXISTS risk_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  medication_id uuid NOT NULL REFERENCES medications(id) ON DELETE RESTRICT,
  pgx_result_id uuid REFERENCES pgx_results(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES drug_gene_rules(id) ON DELETE SET NULL,
  risk_level text NOT NULL CHECK (
    risk_level IN ('low_risk', 'caution', 'potential_concern', 'insufficient_data')
  ),
  patient_summary text NOT NULL,
  clinician_summary text,
  recommended_action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patients_user_id ON patients(user_id);
CREATE INDEX IF NOT EXISTS idx_pgx_results_patient_gene_lower
  ON pgx_results(patient_id, lower(gene));
CREATE INDEX IF NOT EXISTS idx_medications_generic_lower
  ON medications(lower(generic_name));
CREATE INDEX IF NOT EXISTS idx_medications_brand_lower
  ON medications(lower(brand_name));
CREATE INDEX IF NOT EXISTS idx_drug_gene_rules_lookup
  ON drug_gene_rules(medication_id, lower(gene), lower(phenotype))
  WHERE review_status = 'approved';
CREATE INDEX IF NOT EXISTS idx_risk_results_patient_created_at
  ON risk_results(patient_id, created_at DESC);
