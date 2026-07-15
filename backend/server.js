import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { fileURLToPath } from "node:url";
import medicationsRouter from "./routes/medications.js";
import patientsRouter from "./routes/patients.js";
import riskRouter from "./routes/risk.js";

dotenv.config({
  path: fileURLToPath(new URL(".env", import.meta.url)),
  quiet: true,
});

const app = express();
const port = process.env.PORT || 4000;
const host = process.env.HOST || "127.0.0.1";
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const allowedHosts = new Set(["127.0.0.1", "localhost", "::1"]);

if (!allowedHosts.has(host)) {
  console.error("Backend HOST must be a loopback address.");
  process.exit(1);
}

app.use(
  cors({
    origin: frontendOrigin,
  }),
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/medications", medicationsRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/risk", riskRouter);

app.use((err, _req, res, _next) => {
  console.error("Unhandled request error.", {
    name: err?.name,
    code: err?.code,
  });
  res.status(500).json({
    error: "Internal server error",
    message: "The request could not be completed safely.",
  });
});

app.listen(port, host, () => {
  console.log(`Medune backend listening on ${host}:${port}`);
});
