import { createServer } from "node:http";
import { sql, claimJobs, requeueStaleRunning, type JobRow } from "./db.js";
import { handleProductProcess } from "./processors/product-process.js";

// ─── Config (env) ────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5_000);
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 3);
const MAX_RETRIES = Number(process.env.WORKER_MAX_RETRIES ?? 3);
const STALE_MINUTES = Number(process.env.WORKER_STALE_MINUTES ?? 15);
const PORT = Number(process.env.PORT ?? 8080);

if (!DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is required");
  process.exit(1);
}
if (!BLOB_READ_WRITE_TOKEN) {
  console.error("FATAL: BLOB_READ_WRITE_TOKEN is required");
  process.exit(1);
}

// ─── Health endpoint ─────────────────────────────────────────────────────────

createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ status: "ok", worker: "video-worker", pid: process.pid }));
}).listen(PORT, () => {
  console.log(`[video-worker] healthz on :${PORT}`);
});

// ─── Job dispatch ────────────────────────────────────────────────────────────

async function processJob(job: JobRow) {
  switch (job.job_type) {
    case "product_process":
      await handleProductProcess(job, MAX_RETRIES);
      break;
    default:
      // footage / overlay / slideshow / batch_video arrive in later phases.
      await sql`
        UPDATE video_batch_jobs
        SET status = 'failed', error = ${`job_type ${job.job_type} not implemented yet`}, updated_at = now()
        WHERE id = ${job.id}
      `;
      console.warn(`[video-worker] unimplemented job_type: ${job.job_type} (job ${job.id})`);
  }
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function tick() {
  try {
    const reclaimed = await requeueStaleRunning(STALE_MINUTES);
    if (reclaimed > 0) {
      console.log(`[video-worker] requeued ${reclaimed} stale running job(s)`);
    }

    const jobs = await claimJobs(CONCURRENCY);
    if (jobs.length === 0) return;

    console.log(`[video-worker] claiming ${jobs.length} job(s)`);
    await Promise.allSettled(jobs.map(processJob));
  } catch (error) {
    console.error("[video-worker] tick error:", error);
  }
}

console.log(
  `[video-worker] starting: poll=${POLL_INTERVAL_MS}ms concurrency=${CONCURRENCY} maxRetries=${MAX_RETRIES}`
);
await tick();
setInterval(tick, POLL_INTERVAL_MS);
