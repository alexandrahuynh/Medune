import { pool } from "./db.js";
import { hashPassword, MAX_PASSWORD_LENGTH } from "./auth.js";

const email = String(process.env.MEDUNE_ENROLL_EMAIL || "").trim().toLowerCase();
const password = String(process.env.MEDUNE_ENROLL_PASSWORD || "");

if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 10 || password.length > MAX_PASSWORD_LENGTH) {
  console.error("Set MEDUNE_ENROLL_EMAIL and a 10-128 character MEDUNE_ENROLL_PASSWORD.");
  process.exitCode = 1;
} else {
  const passwordHash = await hashPassword(password);
  const { rows } = await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = now()
      WHERE email = $2 AND password_hash IS NULL RETURNING id`,
    [passwordHash, email],
  );
  if (rows.length === 0) {
    console.error("No passwordless account matched that email.");
    process.exitCode = 1;
  } else {
    console.log("Existing account enrolled without changing its patient records.");
  }
}

await pool.end();
