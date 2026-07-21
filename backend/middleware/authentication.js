import { pool } from "../db.js";
import { authenticateToken } from "../auth.js";

export function readBearerToken(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

export function readSessionToken(req) {
  const cookie = String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("medune_session="));
  return cookie ? decodeURIComponent(cookie.slice("medune_session=".length)) : readBearerToken(req);
}

export function createAuthenticationMiddleware(databasePool = pool, authenticate = authenticateToken) {
  return async function authenticationMiddleware(req, res, next) {
    try {
      const auth = await authenticate(databasePool, readSessionToken(req));
      if (!auth) return res.status(401).json({ error: "Unauthorized", message: "Sign in is required." });
      req.auth = auth;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export const requireAuthentication = createAuthenticationMiddleware();
