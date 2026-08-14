import { createReadStream } from "node:fs";
import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL!);

/** Shape of a video_batch_jobs row (only fields the worker touches). */
export type JobRow = {
  id: string;
  batch_id: string | null;
  workspace_id: string;
  product_id: string | null;
  formula_id: string | null;
  job_type: "product_process" | "footage" | "overlay" | "slideshow" | "batch_video" | "scene_render" | "v2v_edit";
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  retries: number;
  metadata: Record<string, unknown> | null;
  error: string | null;
  script: string | null;
  scene_image_url: string | null;
  footage_url: string | null;
  voiceover_url: string | null;
  final_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Atomically claims up to `limit` queued jobs of the given types (single
 * UPDATE ... RETURNING, so concurrent workers never double-claim).
 * The img-worker owns product_process via its own SQL; this worker owns
 * everything else.
 */
export async function claimJobs(limit: number, types: string[]): Promise<JobRow[]> {
  const rows = await sql`
    UPDATE video_batch_jobs
    SET status = 'running', updated_at = now()
    WHERE id IN (
      SELECT id FROM video_batch_jobs
      WHERE status = 'queued' AND job_type = ANY(${types})
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;
  return rows as unknown as JobRow[];
}

/** Requeues jobs stuck in "running" (worker crashed mid-job). */
export async function requeueStaleRunning(staleMinutes: number): Promise<number> {
  const rows = await sql`
    UPDATE video_batch_jobs
    SET status = 'queued', retries = retries + 1, updated_at = now()
    WHERE status = 'running' AND updated_at < now() - make_interval(mins => ${staleMinutes})
    RETURNING id
  `;
  return (rows as unknown as { id: string }[]).length;
}

export async function markDone(jobId: string, fields: Partial<Pick<JobRow, "final_url" | "footage_url" | "voiceover_url" | "thumbnail_url" | "scene_image_url">> = {}) {
  await sql`
    UPDATE video_batch_jobs
    SET status = 'done', updated_at = now(),
        final_url = ${fields.final_url ?? null},
        footage_url = ${fields.footage_url ?? null},
        voiceover_url = ${fields.voiceover_url ?? null},
        thumbnail_url = ${fields.thumbnail_url ?? null},
        scene_image_url = ${fields.scene_image_url ?? null}
    WHERE id = ${jobId}
  `;
}

export async function markFailed(jobId: string, error: string) {
  await sql`
    UPDATE video_batch_jobs
    SET status = 'failed', error = ${error.slice(0, 2000)}, updated_at = now()
    WHERE id = ${jobId}
  `;
}

/** Requeues a failed job if retries remain, otherwise marks it failed. */
export async function failWithRetry(job: JobRow, error: string, maxRetries: number) {
  if (job.retries < maxRetries) {
    await sql`
      UPDATE video_batch_jobs
      SET status = 'queued', retries = retries + 1, error = ${error.slice(0, 2000)}, updated_at = now()
      WHERE id = ${job.id}
    `;
  } else {
    await markFailed(job.id, error);
  }
  if (job.batch_id) await updateBatchProgress(job.batch_id);
}

/**
 * Recomputes a batch's counts + status from its jobs. Called after any job
 * in the batch reaches a terminal state.
 */
export async function updateBatchProgress(batchId: string) {
  const rows = await sql`
    SELECT status, count(*)::int AS n
    FROM video_batch_jobs
    WHERE batch_id = ${batchId}
    GROUP BY status
  `;
  const counts = new Map((rows as unknown as { status: string; n: number }[]).map((r) => [r.status, r.n]));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const done = counts.get("done") ?? 0;
  const failed = counts.get("failed") ?? 0;
  const running = counts.get("running") ?? 0;
  const queued = counts.get("queued") ?? 0;

  let status: string;
  if (total === 0 || (queued === 0 && running === 0 && done === 0 && failed === 0)) {
    status = "queued";
  } else if (failed === total) {
    status = "failed";
  } else if (done === total) {
    status = "done";
  } else if (done + failed === total) {
    status = "partial";
  } else {
    status = "running";
  }

  await sql`
    UPDATE video_batches
    SET completed_count = ${done}, failed_count = ${failed}, total_count = ${total},
        status = ${status}, updated_at = now()
    WHERE id = ${batchId}
  `;
}
