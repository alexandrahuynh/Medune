import { Router } from "express";
import { pool } from "../db.js";
import { searchMedications } from "../searchMedications.js";

const router = Router();

router.get("/search", async (req, res, next) => {
  try {
    const response = await searchMedications(pool, req.query.q);
    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

export default router;
