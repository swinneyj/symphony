import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
// Insert a test download with mute_video=true using the same workspace/user as
// the existing downloads, then report back.
const [row] = await sql`
  INSERT INTO media_downloads (workspace_id, created_by_id, source_url, platform, want_audio, mute_video)
  SELECT workspace_id, created_by_id, 'https://www.tiktok.com/t/ZTDvYxb6x/', 'tiktok', false, true
  FROM media_downloads WHERE status = 'done' LIMIT 1
  RETURNING id, workspace_id, created_by_id, mute_video
`;
console.log(JSON.stringify(row));
