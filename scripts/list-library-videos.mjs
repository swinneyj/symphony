import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT id, file_name, media_type, url, duration, created_at
  FROM media_assets
  WHERE media_type = 'video'
  ORDER BY created_at DESC
  LIMIT 10
`;
console.log(JSON.stringify(rows, null, 1));
