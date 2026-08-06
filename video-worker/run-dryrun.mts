// Launcher for local dry-run testing: loads .env.local and runs the worker.
import { readFileSync } from "node:fs";

const env = readFileSync("/opt/data/symphony/.env.local", "utf8")
  .split("\n")
  .filter((l) => l.trim() && !l.trim().startsWith("#"))
  .reduce((acc, l) => {
    const [k, ...v] = l.split("=");
    acc[k] = v.join("=");
    return acc;
  }, {});

process.env.DATABASE_URL = env.DATABASE_URL;
process.env.VIDEO_DRY_RUN = "1";
process.env.POLL_INTERVAL_MS = "1500";
process.env.WORKER_CONCURRENCY = "2";

await import("./src/index.ts");
