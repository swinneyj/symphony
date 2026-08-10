import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const sql = neon(process.env.DATABASE_URL);

// 1. Get the TikTok account in the Nokturnal Lifestyle workspace
const acc = await sql`SELECT id, access_token FROM social_accounts WHERE platform='tiktok' AND status='connected' LIMIT 1`;
console.log("TIKTOK ACC:", acc.length ? acc[0].id : "NONE");
if (!acc.length) process.exit(1);

// 2. Init upload with the real bytes (same call the dispatcher makes)
const bytes = readFileSync("/tmp/test-tiktok2.mp4");
const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${acc[0].access_token}`,
    "Content-Type": "application/json; charset=UTF-8",
  },
  body: JSON.stringify({
    post_info: {
      title: "Symphony scheduled-publish test — safe to ignore",
      privacy_level: "SELF_ONLY",
      is_reviewed: false,
      disable_comment: false,
      disable_duet: true,
      disable_stitch: true,
      video_cover_timestamp_ms: 1000,
      brand_content_toggle: false,
      brand_organic_toggle: false,
    },
    source_info: { source: "FILE_UPLOAD", video_size: bytes.length, chunk_size: bytes.length, total_chunk_count: 1 },
  }),
});
const initJson = await initRes.json();
if (!initRes.ok) {
  console.log("INIT FAIL:", JSON.stringify(initJson));
  process.exit(1);
}
const { publish_id, upload_url } = initJson.data;
console.log("INIT OK publish_id:", publish_id);

// 3. PUT the bytes
const upRes = await fetch(upload_url, {
  method: "PUT",
  headers: {
    "Content-Type": "video/mp4",
    "Content-Length": String(bytes.length),
    "Content-Range": `bytes 0-${bytes.length - 1}/${bytes.length}`,
  },
  body: Buffer.from(bytes),
});
console.log("UPLOAD:", upRes.status, upRes.statusText);
if (!upRes.ok) process.exit(1);

// 4. Poll status for ~40s
for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const stRes = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${acc[0].access_token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ publish_id }),
  });
  const st = await stRes.json();
  const status = st.data?.status ?? "?";
  console.log(`poll ${i + 1}: ${status}`, st.data?.fail_reason ?? "");
  if (status === "PUBLISH_COMPLETE" || status === "FAILED") {
    console.log("FINAL:", JSON.stringify(st.data));
    break;
  }
}
