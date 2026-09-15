import { createServer } from "node:http";
import { blobToken } from "./env.js";
import { sql, claimJobs, requeueStaleRunning, type JobRow } from "./db.js";
import { handleProductProcess } from "./processors/product-process.js";
import { handleSceneRender } from "./processors/scene-render.js";
import { handleFootage } from "./processors/footage.js";
import { handleAssemble } from "./processors/assemble.js";
import { handleV2VEdit } from "./processors/v2v-edit.js";

// ─── Config (env) ────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
const BLOB_TOKEN = blobToken();
// Keep the queue responsive when work is pending while avoiding Neon wakes
// when the queue is empty. Operators can override these via environment vars.
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60_000);
const MAX_IDLE_INTERVAL_MS = Number(process.env.MAX_IDLE_INTERVAL_MS ?? 300_000);
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 3);
const MAX_RETRIES = Number(process.env.WORKER_MAX_RETRIES ?? 3);
const STALE_MINUTES = Number(process.env.WORKER_STALE_MINUTES ?? 15);
const PORT = Number(process.env.PORT ?? 8080);

const DRY_RUN = ["1", "true"].includes((process.env.VIDEO_DRY_RUN ?? "").toLowerCase());

if (!DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is required");
  process.exit(1);
}
if (!BLOB_TOKEN && !DRY_RUN) {
  console.error("FATAL: BLOB_READ_WRITE_TOKEN is required (or set VIDEO_DRY_RUN=1)");
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
    case "scene_render":
      await handleSceneRender(job, MAX_RETRIES);
      break;
    case "footage":
      await handleFootage(job, MAX_RETRIES);
      break;
    case "batch_video":
      await handleAssemble(job, MAX_RETRIES);
      break;
    case "v2v_edit":
      await handleV2VEdit(job, MAX_RETRIES);
      break;
    default:
      // overlay / slideshow arrive in later phases.
      await sql`
        UPDATE video_batch_jobs
        SET status = 'failed', error = ${`job_type ${job.job_type} not implemented yet`}, updated_at = now()
        WHERE id = ${job.id}
      `;
      console.warn(`[video-worker] unimplemented job_type: ${job.job_type} (job ${job.id})`);
  }
}

// ─── Neon compute gate ──────────────────────────────────────────────────────
// Skip the DB poll unless an API enqueue hook has set the KV job flag. The
// periodic safety poll covers missed enqueue hooks without returning to
// continuous Neon polling. Chained jobs keep the flag open until an empty
// queue is observed.
const GATE_URL = process.env.WORKER_GATE_URL ?? "https://www.symphonyapp.company/api/cron/worker-gate";
const GATE_SECRET = process.env.CRON_SECRET;
const GATE_MAX_SKIP_MS = 4 * 60 * 60 * 1000;
let lastDbPollAt = 0;

async function gateDue(worker: string): Promise<boolean> {
  if (Date.now() - lastDbPollAt >= GATE_MAX_SKIP_MS) return true;
  try {
    const res = await fetch(`${GATE_URL}?w=${worker}`, {
      headers: GATE_SECRET ? { Authorization: `Bearer ${GATE_SECRET}` } : {},
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return true;
    return (await res.json()).due !== false;
  } catch {
    return true;
  }
}

async function gateClear(worker: string): Promise<void> {
  try {
    await fetch(`${GATE_URL}?w=${worker}`, {
      method: "DELETE",
      headers: GATE_SECRET ? { Authorization: `Bearer ${GATE_SECRET}` } : {},
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    /* non-fatal */
  }
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function tick() {
  try {
    if (!(await gateDue("video"))) return false;
    lastDbPollAt = Date.now();

    const reclaimed = await requeueStaleRunning(STALE_MINUTES);
    if (reclaimed > 0) {
      console.log(`[video-worker] requeued ${reclaimed} stale running job(s)`);
    }

    const jobs = await claimJobs(CONCURRENCY, ["scene_render", "footage", "batch_video", "overlay", "slideshow", "v2v_edit"]);
    if (jobs.length === 0) {
      await gateClear("video");
      return false;
    }

    console.log(`[video-worker] claiming ${jobs.length} job(s)`);
    await Promise.allSettled(jobs.map(processJob));
    return true;
  } catch (error) {
    console.error("[video-worker] tick error:", error);
    return false;
  }
}

console.log(
  `[video-worker] starting: poll=${POLL_INTERVAL_MS}ms concurrency=${CONCURRENCY} maxRetries=${MAX_RETRIES}`
);
let idleInterval = POLL_INTERVAL_MS;
while (true) {
  const hadWork = await tick();
  idleInterval = hadWork
    ? POLL_INTERVAL_MS
    : Math.min(idleInterval * 2, MAX_IDLE_INTERVAL_MS);
  await new Promise((resolve) => setTimeout(resolve, idleInterval));
}
