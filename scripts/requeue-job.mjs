// Requeue a failed job by id: node requeue-job.mjs <jobId>
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const jobId = process.argv[2];
const url = readFileSync("/opt/data/symphony/.env.local", "utf8")
  .match(/DATABASE_URL=(.+)/)?.[1]
  ?.trim();
const sql = neon(url);
await sql`UPDATE video_batch_jobs SET status = 'queued', retries = 0, error = NULL WHERE id = ${jobId}`;
console.log("re-queued", jobId);
