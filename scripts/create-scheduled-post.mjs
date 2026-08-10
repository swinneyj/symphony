import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

// 1. Insert a media asset pointing at the public test video
const [asset] = await sql`
  INSERT INTO media_assets (workspace_id, uploaded_by_id, file_name, file_size, mime_type, media_type, url)
  VALUES (
    '1de96f42-a098-4e0b-b407-79a7bd3a9e31',
    '47ff0d1c-22f8-4a3f-a3e9-68b29420c2a0',
    'test-tiktok2.mp4',
    1205638,
    'video/mp4',
    'video',
    'https://tmpfiles.org/dl/wUw6OHD2gGXZ/test-tiktok2.mp4'
  )
  RETURNING id
`;
console.log("MEDIA:", asset.id);

// 2. Insert a scheduled post (due NOW) with tiktok platform config
const [post] = await sql`
  INSERT INTO posts (workspace_id, created_by_id, content, media_ids, platform_configs, status, scheduled_for)
  VALUES (
    '1de96f42-a098-4e0b-b407-79a7bd3a9e31',
    '47ff0d1c-22f8-4a3f-a3e9-68b29420c2a0',
    'Symphony scheduled-publish test — dispatcher E2E',
    ARRAY[${asset.id}]::uuid[],
    '{"tiktok": {}}'::jsonb,
    'scheduled',
    now()
  )
  RETURNING id
`;
console.log("POST:", post.id);
console.log("READY — fire /api/cron/publish now");
