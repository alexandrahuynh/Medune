import { Router } from "express";
import { pool } from "../db.js";
import { loginAccount, registerAccount, revokeToken } from "../auth.js";
import { readSessionToken, requireAuthentication } from "../middleware/authentication.js";
import { createCsrfToken, requireCsrf, requireTrustedOrigin } from "../middleware/requestSecurity.js";
import { loginThrottle, registrationThrottle } from "../middleware/authThrottle.js";

const router = Router();
const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";

router.post("/register", requireTrustedOrigin, registrationThrottle, async (req, res, next) => {
  try {
    const result = await registerAccount(pool, req.body);
    return res.status(result.supported ? 201 : result.code === "EMAIL_EXISTS" ? 409 : 400).json(result);
  } catch (error) { return next(error); }
});

router.post("/login", requireTrustedOrigin, loginThrottle, async (req, res, next) => {
  try {
    const result = await loginAccount(pool, req.body);
    if (result.supported) {
      res.setHeader("Set-Cookie", `medune_session=${encodeURIComponent(result.token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secureCookie}`);
      result.csrfToken = createCsrfToken(result.token);
      delete result.token;
    }
    return res.status(result.supported ? 200 : 401).json(result);
  } catch (error) { return next(error); }
});

router.get("/me", requireAuthentication, (req, res) => {
  const token = readSessionToken(req);
  return res.json({ supported: true, user: { email: req.auth.email, firstName: req.auth.first_name, lastName: req.auth.last_name, patientId: req.auth.patient_id }, csrfToken: createCsrfToken(token) });
});

router.post("/logout", requireTrustedOrigin, requireAuthentication, requireCsrf, async (req, res, next) => {
  try {
    await revokeToken(pool, readSessionToken(req));
    res.setHeader("Set-Cookie", "medune_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    return res.json({ supported: true });
  } catch (error) { return next(error); }
});

export default router;
