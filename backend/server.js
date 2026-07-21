import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL(".env", import.meta.url)), quiet: true });

const port = process.env.PORT || 4000;
const host = process.env.HOST || "127.0.0.1";
const allowedHosts = new Set(["127.0.0.1", "localhost", "::1", "0.0.0.0"]);
if (!allowedHosts.has(host)) {
  console.error("Backend HOST must be a loopback address or 0.0.0.0 (containerized).");
  process.exit(1);
}

const { createApp } = await import("./app.js");
createApp().listen(port, host, () => console.log(`Medune backend listening on ${host}:${port}`));
