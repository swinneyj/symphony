import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
// Remove the mute test download + its library asset (keep the blob files; they're orphaned but harmless).
const dl = await sql`DELETE FROM media_downloads WHERE id = '0be0d2eb-8198-4ea9-8beb-f2c2fa7967ad' RETURNING video_url`;
if (dl.length) {
  await sql`DELETE FROM media_assets WHERE url = ${dl[0].video_url}`;
}
console.log("cleaned test download", dl.length ? "ok" : "already gone");
