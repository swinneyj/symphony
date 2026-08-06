// Smoke test verify + cleanup. Prints job/batch state, then deletes test rows.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const url = readFileSync("/opt/data/symphony/.env.local", "utf8")
  .match(/DATABASE_URL=(.+)/)?.[1]
  ?.trim();
const sql = neon(url);

const [batchId] = process.argv.slice(2);
if (!batchId) {
  console.error("usage: node e2e-smoke-verify.mjs <batchId>");
  process.exit(1);
}

const jobs = await sql`
  SELECT job_type, status, footage_url IS NOT NULL AS has_footage,
         final_url IS NOT NULL AS has_final, error, metadata->>'vo' IS NOT NULL AS has_vo
  FROM video_batch_jobs WHERE batch_id = ${batchId} ORDER BY created_at
`;
const batch = await sql`
  SELECT status, total_count, completed_count, failed_count FROM video_batches WHERE id = ${batchId}
`;
console.log("JOBS:", JSON.stringify(jobs));
console.log("BATCH:", JSON.stringify(batch));

// cleanup
const p = await sql`SELECT product_id FROM video_batch_jobs WHERE batch_id = ${batchId} LIMIT 1`;
if (p[0]) await sql`DELETE FROM products WHERE id = ${p[0].product_id}`;
await sql`DELETE FROM video_batches WHERE id = ${batchId}`;
console.log("cleaned");
