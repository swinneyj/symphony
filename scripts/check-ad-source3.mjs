import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT id, status, platform, left(source_url, 90) AS src, error IS NOT NULL AS has_err, created_at
  FROM ad_sources
  ORDER BY created_at DESC
  LIMIT 8
`;
console.log(JSON.stringify(rows, null, 1));
