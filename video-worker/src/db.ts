import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL!);

/** Shape of a video_batch_jobs row (only fields the worker touches). */
export type JobRow = {
  id: string;
  batch_id: string | null;
  workspace_id: string;
  product_id: string | null;
  formula_id: string | null;
  job_type: "product_process" | "footage" | "overlay" | "slideshow" | "batch_video";
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  retries: number;
  metadata: Record<string, unknown> | null;
  error: string | null;
  script: string | null;
  footage_url: string | null;
  voiceover_url: string | null;
  final_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Atomically claims up to `limit` queued jobs (single UPDATE ... RETURNING,
 * so concurrent workers never double-claim).
 */
export async function claimJobs(limit: number): Promise<JobRow[]> {
  const rows = await sql`
    UPDATE video_batch_jobs
    SET status = 'running', updated_at = now()
    WHERE id IN (
      SELECT id FROM video_batch_jobs
      WHERE status = 'queued'
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

export async function markDone(jobId: string, fields: Partial<Pick<JobRow, "final_url" | "footage_url" | "voiceover_url" | "thumbnail_url">> = {}) {
  await sql`
    UPDATE video_batch_jobs
    SET status = 'done', updated_at = now(),
        final_url = ${fields.final_url ?? null},
        footage_url = ${fields.footage_url ?? null},
        voiceover_url = ${fields.voiceover_url ?? null},
        thumbnail_url = ${fields.thumbnail_url ?? null}
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
}
