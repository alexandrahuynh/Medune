BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;

CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TEMP TABLE patient_merge ON COMMIT DROP AS
SELECT id AS old_id,
       first_value(id) OVER (PARTITION BY user_id ORDER BY created_at, id) AS canonical_id
FROM patients;

INSERT INTO pgx_results (patient_id, gene, phenotype, genotype, source, created_at, updated_at)
SELECT DISTINCT ON (m.canonical_id, lower(p.gene))
       m.canonical_id, p.gene, p.phenotype, p.genotype, p.source, p.created_at, p.updated_at
FROM pgx_results p
JOIN patient_merge m ON m.old_id = p.patient_id
WHERE m.old_id <> m.canonical_id
ORDER BY m.canonical_id, lower(p.gene), p.updated_at DESC
ON CONFLICT (patient_id, gene) DO UPDATE SET
  phenotype = EXCLUDED.phenotype,
  genotype = EXCLUDED.genotype,
  source = EXCLUDED.source,
  updated_at = GREATEST(pgx_results.updated_at, EXCLUDED.updated_at);

INSERT INTO patient_medications (patient_id, medication_id, status, notes, started_at, stopped_at, created_at, updated_at)
SELECT DISTINCT ON (m.canonical_id, pm.medication_id)
       m.canonical_id, pm.medication_id, pm.status, pm.notes, pm.started_at,
       pm.stopped_at, pm.created_at, pm.updated_at
FROM patient_medications pm
JOIN patient_merge m ON m.old_id = pm.patient_id
WHERE m.old_id <> m.canonical_id
ORDER BY m.canonical_id, pm.medication_id, pm.updated_at DESC
ON CONFLICT (patient_id, medication_id) DO UPDATE SET
  status = EXCLUDED.status,
  notes = CASE
    WHEN patient_medications.notes IS NULL THEN EXCLUDED.notes
    WHEN EXCLUDED.notes IS NULL OR patient_medications.notes = EXCLUDED.notes THEN patient_medications.notes
    ELSE patient_medications.notes || E'\n[Merged record] ' || EXCLUDED.notes
  END,
  started_at = COALESCE(patient_medications.started_at, EXCLUDED.started_at),
  stopped_at = COALESCE(EXCLUDED.stopped_at, patient_medications.stopped_at),
  updated_at = GREATEST(patient_medications.updated_at, EXCLUDED.updated_at);

UPDATE risk_results r SET patient_id = m.canonical_id
FROM patient_merge m
WHERE r.patient_id = m.old_id AND m.old_id <> m.canonical_id;

DELETE FROM pgx_results p USING patient_merge m
WHERE p.patient_id = m.old_id AND m.old_id <> m.canonical_id;

DELETE FROM patient_medications pm USING patient_merge m
WHERE pm.patient_id = m.old_id AND m.old_id <> m.canonical_id;

DELETE FROM patients p USING patient_merge m
WHERE p.id = m.old_id AND m.old_id <> m.canonical_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'patients'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) = 'UNIQUE (user_id)'
  ) THEN
    ALTER TABLE patients ADD CONSTRAINT uq_patients_user_id UNIQUE (user_id);
  END IF;
END $$;

COMMIT;
