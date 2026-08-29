const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT id, status, metadata, error, created_at
  FROM video_batch_jobs
  WHERE job_type = 'v2v_edit' AND created_at > now() - interval '2 days'
  ORDER BY created_at DESC
  LIMIT 20
`;
for (const r of rows) {
  const m = r.metadata ?? {};
  console.log(`\n=== ${r.id} [${r.status}] ${r.created_at?.toISOString?.() ?? r.created_at}`);
  console.log("model:", m.model, "| duration:", m.durationSec, "| src:", String(m.sourceVideoUrl ?? "").slice(0, 70));
  if (r.error) console.log("error:", String(r.error).slice(0, 160));
}
