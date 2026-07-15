import { Router } from "express";
import { pool } from "../db.js";
import { matchRules } from "../matchRules.js";

const router = Router();

router.post("/match", async (req, res, next) => {
  try {
    const response = await matchRules(pool, {
      patientId: req.body?.patientId,
      medicationId: req.body?.medicationId,
    });
    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

export default router;
