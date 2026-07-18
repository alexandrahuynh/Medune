const MISSING_EMAIL_MESSAGE = "Provide an account email.";

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function cleanName(value, fallback) {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

async function findOrCreateUser(pool, email) {
  // One user row per email. Insert if new, otherwise reuse the existing row.
  const { rows } = await pool.query(
    `
    INSERT INTO users (email, role)
    VALUES ($1, 'patient')
    ON CONFLICT (email) DO UPDATE SET updated_at = now()
    RETURNING id, email;
    `,
    [email],
  );

  return rows[0];
}

async function findOrCreatePatient(pool, userId, firstName, lastName) {
  const existing = await pool.query(
    `
    SELECT id, first_name, last_name
    FROM patients
    WHERE user_id = $1
    ORDER BY created_at ASC
    LIMIT 1;
    `,
    [userId],
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const { rows } = await pool.query(
    `
    INSERT INTO patients (user_id, first_name, last_name)
    VALUES ($1, $2, $3)
    RETURNING id, first_name, last_name;
    `,
    [userId, firstName, lastName],
  );

  return rows[0];
}

export async function resolvePatient(
  pool,
  { email, firstName, lastName } = {},
) {
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail) {
    return {
      supported: false,
      message: MISSING_EMAIL_MESSAGE,
    };
  }

  const user = await findOrCreateUser(pool, cleanEmail);
  const patient = await findOrCreatePatient(
    pool,
    user.id,
    cleanName(firstName, "Patient"),
    cleanName(lastName, "User"),
  );

  return {
    supported: true,
    email: user.email,
    userId: user.id,
    patientId: patient.id,
    firstName: patient.first_name,
    lastName: patient.last_name,
  };
}
