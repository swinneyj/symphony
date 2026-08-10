import "dotenv/config";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
await sql`UPDATE media_assets SET url = 'https://raw.githubusercontent.com/swinneyj/symphony/scratch/test-video/test-tiktok2.mp4' WHERE id = 'de01bbbb-1ec7-4c59-8ed1-58359a34deeb'`;
await sql`UPDATE posts SET status = 'scheduled', scheduled_for = now(), failure_reason = NULL, platform_configs = '{"tiktok": {}}'::jsonb WHERE id = '51a44cc2-11bb-4435-b37f-53da81c87cec'`;
console.log("reset done");
