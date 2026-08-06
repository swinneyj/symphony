// Phase the real-mode test: re-process image first, then queue footage.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const url = readFileSync("/opt/data/symphony/.env.local", "utf8")
  .match(/DATABASE_URL=(.+)/)?.[1]
  ?.trim();
const sql = neon(url);

const productId = "bb9f4d35-8854-4201-a24d-4e122d3cfe4f";
const batchId = "8e6431bd-4ee1-4c0d-9b32-07db7f63815c";
const imgJobId = "9ecead89-b3f5-41f2-80a2-8eaafbc6c1bb";
const footageJobId = "7e62f69f-a773-4a39-9001-fa5209fb7213";

// 1. drop the (stale) footage job, 2. requeue image processing
await sql`DELETE FROM video_batch_jobs WHERE id = ${footageJobId}`;
await sql`UPDATE video_batch_jobs SET status = 'queued', retries = 0, error = NULL WHERE id = ${imgJobId}`;
console.log("img job re-queued, footage job held");

// 2. wait for product ready (new padded processed.png)
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const [p] = await sql`SELECT status FROM products WHERE id = ${productId}`;
  if (p?.status === "ready") {
    console.log("product ready after", (i + 1) * 3, "s");
    break;
  }
}

// 3. insert the footage job fresh
const [formula] = await sql`SELECT id FROM video_formulas WHERE is_system = true LIMIT 1`;
const [voice] = await sql`SELECT id FROM voices WHERE provider = 'openai_tts' LIMIT 1`;
const [job] = await sql`
  INSERT INTO video_batch_jobs (batch_id, workspace_id, product_id, formula_id, job_type, status, script, retries, created_at, updated_at)
  VALUES (${batchId}, 'f59bcfbe-54a8-431c-8085-c59f166d24e8', ${productId}, ${formula.id}, 'footage', 'queued',
          'This watch is the upgrade your wrist deserves — clean design, precision build, and it goes with everything.',
          0, now(), now())
  RETURNING id
`;
console.log("footage job queued:", job.id);
