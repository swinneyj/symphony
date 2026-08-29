import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT id, status, platform, source_url,
         created_at, updated_at, error
  FROM media_downloads
  ORDER BY created_at DESC
  LIMIT 5
`;
for (const r of rows) {
  console.log(JSON.stringify({
    id: r.id?.toString().slice(0, 8),
    status: r.status,
    platform: r.platform,
    url: (r.source_url || "").slice(0, 60),
    created: r.created_at,
    updated: r.updated_at,
    error: (r.error || "").slice(0, 80),
  }));
}
