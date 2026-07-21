import { createHmac, timingSafeEqual } from "node:crypto";
import { readSessionToken } from "./authentication.js";

const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const csrfSecret = process.env.MEDUNE_CSRF_SECRET || "development-only-change-me";

export function createCsrfToken(sessionToken) {
  return createHmac("sha256", csrfSecret).update(String(sessionToken)).digest("base64url");
}

export function requireTrustedOrigin(req, res, next) {
  if (req.headers.origin !== frontendOrigin) {
    return res.status(403).json({ error: "Forbidden", message: "Request origin is not allowed." });
  }
  return next();
}

export function requireCsrf(req, res, next) {
  const sessionToken = readSessionToken(req);
  const supplied = String(req.headers["x-csrf-token"] || "");
  const expected = createCsrfToken(sessionToken);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (!sessionToken || suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return res.status(403).json({ error: "Forbidden", message: "CSRF validation failed." });
  }
  return next();
}

