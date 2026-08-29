import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT id, status, error, source_url, created_at, updated_at
  FROM ad_sources
  WHERE source_url ILIKE '%ZT9kYYAeTDq34%' OR id::text LIKE '%ZT9kYYAeTDq34%'
  ORDER BY created_at DESC
  LIMIT 5
`;
console.log(JSON.stringify(rows, null, 1));
