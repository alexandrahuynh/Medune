import { promisify } from "node:util";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";

const scrypt = promisify(scryptCallback);
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
export const MAX_PASSWORD_LENGTH = 128;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(String(password), salt, 64);
  return `scrypt:${salt}:${Buffer.from(derived).toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [algorithm, salt, expectedHex] = String(stored || "").split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(await scrypt(String(password), salt, expected.length));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function validateRegistration({ email, password, firstName, lastName }) {
  const cleanEmail = normalizeEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return { error: "Provide a valid email address." };
  if (String(password || "").length < 10 || String(password).length > MAX_PASSWORD_LENGTH) return { error: `Password must contain between 10 and ${MAX_PASSWORD_LENGTH} characters.` };
  if (!String(firstName || "").trim() || !String(lastName || "").trim()) return { error: "First and last name are required." };
  return { cleanEmail };
}

export async function registerAccount(pool, input = {}) {
  const validation = validateRegistration(input);
  if (validation.error) return { supported: false, code: "INVALID_INPUT", message: validation.error };
  const passwordHash = await hashPassword(input.password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query(
      `INSERT INTO users (email, role, password_hash) VALUES ($1, 'patient', $2)
       RETURNING id, email`,
      [validation.cleanEmail, passwordHash],
    );
    await client.query(
      `INSERT INTO patients (user_id, first_name, last_name) VALUES ($1, $2, $3)`,
      [user.rows[0].id, String(input.firstName).trim(), String(input.lastName).trim()],
    );
    await client.query("COMMIT");
    return { supported: true, message: "Account created." };
  } catch (error) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") return { supported: false, code: "EMAIL_EXISTS", message: "An account with this email already exists." };
    throw error;
  } finally {
    client.release();
  }
}

export async function loginAccount(pool, { email, password } = {}) {
  if (!password || String(password).length > MAX_PASSWORD_LENGTH) {
    return { supported: false, code: "INVALID_CREDENTIALS", message: "Incorrect email or password." };
  }
  const cleanEmail = normalizeEmail(email);
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.email, u.password_hash, p.id AS patient_id,
            p.first_name, p.last_name
       FROM users u JOIN patients p ON p.user_id = u.id
      WHERE u.email = $1 ORDER BY p.created_at ASC LIMIT 1`,
    [cleanEmail],
  );
  const account = rows[0];
  if (!account || !(await verifyPassword(password, account.password_hash))) {
    return { supported: false, code: "INVALID_CREDENTIALS", message: "Incorrect email or password." };
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await pool.query("DELETE FROM user_sessions WHERE expires_at <= now()");
  await pool.query(
    "INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [account.user_id, hashToken(token), expiresAt],
  );
  return {
    supported: true,
    token,
    user: { email: account.email, firstName: account.first_name, lastName: account.last_name, patientId: account.patient_id },
  };
}

export async function authenticateToken(pool, token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.email, p.id AS patient_id, p.first_name, p.last_name
       FROM user_sessions s JOIN users u ON u.id = s.user_id
       JOIN patients p ON p.user_id = u.id
      WHERE s.token_hash = $1 AND s.expires_at > now()
      ORDER BY p.created_at ASC LIMIT 1`,
    [hashToken(token)],
  );
  return rows[0] || null;
}

export async function revokeToken(pool, token) {
  if (token) await pool.query("DELETE FROM user_sessions WHERE token_hash = $1", [hashToken(token)]);
}
