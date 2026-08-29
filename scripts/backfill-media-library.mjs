import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
// Backfill: insert media_assets rows for done downloads that aren't in the
// library yet (video only; mp3 audio is stored on the download row's audio_url).
const done = await sql`
  SELECT md.id, md.workspace_id, md.created_by_id, md.source_url,
         md.title, md.video_url, md.audio_url
  FROM media_downloads md
  WHERE md.status = 'done' AND md.video_url IS NOT NULL
  ORDER BY md.created_at
`;
let inserted = 0;
for (const d of done) {
  const exists = await sql`
    SELECT 1 FROM media_assets WHERE url = ${d.video_url} LIMIT 1
  `;
  if (exists.length) continue;
  const title = d.title ?? `download-${d.id}`;
  const safeName = title.replace(/[^\w\- ]+/g, "_").trim().replace(/^_+|_+$/g, "") || "download";
  await sql`
    INSERT INTO media_assets
      (workspace_id, uploaded_by_id, file_name, mime_type, media_type, url, alt)
    VALUES (${d.workspace_id}, ${d.created_by_id}, ${safeName + ".mp4"},
            'video/mp4', 'video', ${d.video_url}, ${d.source_url})
  `;
  inserted++;
}
console.log(`backfilled ${inserted} download(s) into media_assets`);
