// Load .env / .env.local for scripts run outside Next.js (Node 20.12+).
import fs from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (fs.existsSync(file)) process.loadEnvFile(file);
}
