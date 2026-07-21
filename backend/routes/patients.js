import { Router } from "express";
import { pool } from "../db.js";
import { getPgxResults, savePgxResult } from "../pgxResults.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { requireCsrf, requireTrustedOrigin } from "../middleware/requestSecurity.js";
import {
  addPatientMedication,
  listPatientMedications,
  removePatientMedication,
  updatePatientMedication,
} from "../patientMedications.js";

const router = Router();

router.use(requireAuthentication);
router.use((req, res, next) => req.method === "GET" ? next() : requireTrustedOrigin(req, res, () => requireCsrf(req, res, next)));

router.get("/me/pgx-results", async (req, res, next) => {
  try {
    const response = await getPgxResults(pool, req.auth.patient_id);
    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

router.post("/me/pgx-results", async (req, res, next) => {
  try {
    const response = await savePgxResult(pool, req.auth.patient_id, {
      gene: req.body?.gene,
      phenotype: req.body?.phenotype,
      genotype: req.body?.genotype,
    });
    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

router.get("/me/medications", async (req, res, next) => {
  try {
    return res.json(await listPatientMedications(pool, req.auth.patient_id));
  } catch (error) {
    return next(error);
  }
});

router.post("/me/medications", async (req, res, next) => {
  try {
    const response = await addPatientMedication(pool, req.auth.patient_id, req.body?.medicationId);
    const status = response.supported ? 201 : response.code === "DUPLICATE_MEDICATION" ? 409 : response.code === "MEDICATION_NOT_FOUND" ? 404 : 400;
    return res.status(status).json(response);
  } catch (error) {
    return next(error);
  }
});

router.patch("/me/medications/:itemId", async (req, res, next) => {
  try {
    const response = await updatePatientMedication(pool, req.auth.patient_id, req.params.itemId, req.body);
    return res.status(response.supported ? 200 : response.code === "NOT_FOUND" ? 404 : 400).json(response);
  } catch (error) {
    return next(error);
  }
});

router.delete("/me/medications/:itemId", async (req, res, next) => {
  try {
    const response = await removePatientMedication(pool, req.auth.patient_id, req.params.itemId);
    return res.status(response.supported ? 200 : 404).json(response);
  } catch (error) {
    return next(error);
  }
});

export default router;
