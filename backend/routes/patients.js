import { Router } from "express";
import { pool } from "../db.js";
import { getPgxResults, savePgxResult } from "../pgxResults.js";

const router = Router();

router.get("/:patientId/pgx-results", async (req, res, next) => {
  try {
    const response = await getPgxResults(pool, req.params.patientId);
    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

router.post("/:patientId/pgx-results", async (req, res, next) => {
  try {
    const response = await savePgxResult(pool, req.params.patientId, {
      gene: req.body?.gene,
      phenotype: req.body?.phenotype,
      genotype: req.body?.genotype,
    });
    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

export default router;
