// Smoke test: insert a test product + batch + footage job, print IDs.
// Containers claim + process; verify with verify script; cleanup after.
// Run: node --env-file=.env.local e2e-smoke-setup.mjs
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const url = readFileSync("/opt/data/symphony/.env.local", "utf8")
  .match(/DATABASE_URL=(.+)/)?.[1]
  ?.trim();
const sql = neon(url);

// Look up real workspace + user (don't hardcode — IDs change across DBs)
const [wsRow] = await sql`SELECT id FROM workspaces ORDER BY created_at LIMIT 1`;
const [userRow] = await sql`SELECT id FROM users ORDER BY created_at LIMIT 1`;
const workspaceId = wsRow.id;
const userId = userRow.id;
console.log("using workspace", workspaceId, "user", userId);

// 1. Product (real image URL so img-worker has something to process)
const [product] = await sql`
  INSERT INTO products (name, price, original_image_url, status, workspace_id, created_by_id)
  VALUES ('Smoke Test Watch', 12.99, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30',
          'raw', ${workspaceId}, ${userId})
  RETURNING id, name
`;
// 2. Formula + voice (seeded system rows)
const [formula] = await sql`
  SELECT id FROM video_formulas WHERE is_system = true LIMIT 1
`;
const [voice] = await sql`
  SELECT id FROM voices WHERE provider = 'openai_tts' LIMIT 1
`;
// 3. Batch
const [batch] = await sql`
  INSERT INTO video_batches (name, workspace_id, created_by_id, formula_id, voice_id, provider, status, total_count, completed_count, failed_count)
  VALUES ('smoke-test-e2e', ${workspaceId}, ${userId}, ${formula.id}, ${voice.id}, 'sora', 'queued', 1, 0, 0)
  RETURNING id
`;
// 4. Chain jobs: product_process (img-worker) → scene_render (video-worker)
// → footage (chained by scene_render) → batch_video (chained by footage).
const [imgJob] = await sql`
  INSERT INTO video_batch_jobs (batch_id, workspace_id, product_id, formula_id, job_type, status, retries, created_at, updated_at)
  VALUES (${batch.id}, ${workspaceId}, ${product.id}, ${formula.id}, 'product_process', 'queued',
          0, now(), now())
  RETURNING id
`;
const [sceneJob] = await sql`
  INSERT INTO video_batch_jobs (batch_id, workspace_id, product_id, formula_id, job_type, status, script, retries, created_at, updated_at)
  VALUES (${batch.id}, ${workspaceId}, ${product.id}, ${formula.id}, 'scene_render', 'queued',
          'Watch this — the Smoke Test LED Strip is the upgrade your room needs.',
          0, now(), now())
  RETURNING id
`;
console.log(JSON.stringify({ productId: product.id, batchId: batch.id, imgJobId: imgJob.id, sceneJobId: sceneJob.id }));
