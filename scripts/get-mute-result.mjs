import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const [row] = await sql`
  SELECT id, status, video_url, mute_video
  FROM media_downloads WHERE id = '0be0d2eb-8198-4ea9-8beb-f2c2fa7967ad'
`;
console.log(JSON.stringify(row));
