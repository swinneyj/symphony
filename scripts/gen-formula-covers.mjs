// Generate BatchBot-style cover images for all system formulas.
// Uses OpenAI gpt-image-2 (fal + Gemini prepay are depleted as of 2026-08-14),
// uploads to Vercel Blob, stores URL in video_formulas.cover_image_url.
// Idempotent: skips rows with covers. 36 × ~$0.05-0.08 ≈ $2-3 one-time.
//
// Usage: OPENAI_API_KEY=... BLOB_READ_WRITE_TOKEN=... DATABASE_URL=... node scripts/gen-formula-covers.mjs

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!DATABASE_URL || !OPENAI_API_KEY || !BLOB_TOKEN) {
  console.error("OPENAI_API_KEY, BLOB_READ_WRITE_TOKEN and DATABASE_URL are required");
  process.exit(1);
}
const sql = neon(DATABASE_URL);

const COVER_PROMPT = (scene) =>
  `Vertical TikTok product-video cover thumbnail, 9:16. ${scene ?? "A product on a clean studio backdrop."} ` +
  `Photorealistic, cinematic lighting, no text, no words, no watermark, no logo.`;

async function generateCover(prompt) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-2", prompt, size: "1024x1792", n: 1 }),
  });
  const data = await res.json();
  if (!res.ok || !data?.data?.[0]?.b64_json) {
    throw new Error(`openai ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  const buf = Buffer.from(data.data[0].b64_json, "base64");
  const upload = await fetch("https://api.vercel.com/v2/blob/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${BLOB_TOKEN}`, "Content-Type": "application/octet-stream" },
    body: buf,
  });
  const up = await upload.json();
  if (!upload.ok || !up?.url) {
    throw new Error(`blob ${upload.status}: ${JSON.stringify(up).slice(0, 200)}`);
  }
  return up.url;
}

const rows = await sql`
  SELECT id, name, scene_prompt_template
  FROM video_formulas
  WHERE workspace_id IS NULL AND (cover_image_url IS NULL OR cover_image_url = '')
  ORDER BY name
`;
console.log(`Generating covers for ${rows.length} formulas…`);

let ok = 0;
let fail = 0;
for (const r of rows) {
  process.stdout.write(`• ${r.name} … `);
  try {
    const url = await generateCover(COVER_PROMPT(r.scene_prompt_template));
    await sql`UPDATE video_formulas SET cover_image_url = ${url}, updated_at = now() WHERE id = ${r.id}`;
    console.log("OK");
    ok++;
  } catch (e) {
    console.log(`FAIL ${e.message.slice(0, 100)}`);
    fail++;
  }
  await new Promise((r) => setTimeout(r, 1500)); // rate limit
}

console.log(`\nDone: ${ok} covers generated, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
