// Local dry-run launcher: loads .env.local env vars and runs the worker via tsx.
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const envText = readFileSync("/opt/data/symphony/.env.local", "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const child = spawn(
  process.execPath,
  ["./node_modules/tsx/dist/cli.mjs", "src/index.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ...env,
      VIDEO_DRY_RUN: process.env.VIDEO_DRY_RUN ?? "1",
      POLL_INTERVAL_MS: process.env.POLL_INTERVAL_MS ?? "1500",
    },
  }
);
child.on("exit", (code) => process.exit(code ?? 0));
