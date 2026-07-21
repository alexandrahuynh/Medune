import { Router } from "express";
import { pool } from "../db.js";
import { matchRules } from "../matchRules.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { requireCsrf, requireTrustedOrigin } from "../middleware/requestSecurity.js";

const router = Router();

router.post("/match", requireTrustedOrigin, requireAuthentication, requireCsrf, async (req, res, next) => {
  try {
    const response = await matchRules(pool, {
      patientId: req.auth.patient_id,
      medicationId: req.body?.medicationId,
    });
    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

export default router;
