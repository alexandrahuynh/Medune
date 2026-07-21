import cors from "cors";
import express from "express";
import authRouter from "./routes/auth.js";
import medicationsRouter from "./routes/medications.js";
import patientsRouter from "./routes/patients.js";
import riskRouter from "./routes/risk.js";

export function createApp() {
  const app = express();
  const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
  app.use(cors({ origin: frontendOrigin, credentials: true }));
  app.use(express.json({ limit: "32kb" }));
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/medications", medicationsRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/patients", patientsRouter);
  app.use("/api/risk", riskRouter);
  app.use((err, _req, res, _next) => {
    console.error("Unhandled request error.", { name: err?.name, code: err?.code });
    res.status(500).json({ error: "Internal server error", message: "The request could not be completed safely." });
  });
  return app;
}

