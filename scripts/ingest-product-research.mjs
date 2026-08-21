#!/usr/bin/env node
/**
 * ingest-product-research.mjs — load ttshop-research passers into product_watchlist.
 *
 * Reads the products-scored.json export from the freebuff research pipeline and
 * upserts every passing product into product_watchlist (the free-path product
 * monitor: rank/sales trajectory across daily snapshots).
 *
 * Usage:
 *   node scripts/ingest-product-research.mjs <products-scored.json> [--dry-run]
 *
 * Env: DATABASE_URL (BSM wrapper supplies at run time, same as discount-watchdog).
 */
import { readFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";

const [jsonPath, ...rest] = process.argv.slice(2);
const dryRun = rest.includes("--dry-run");
if (!jsonPath) {
  console.error(
    "usage: node scripts/ingest-product-research.mjs <products-scored.json> [--dry-run]"
  );
  process.exit(2);
}

let rows;
try {
  rows = JSON.parse(readFileSync(jsonPath, "utf8"));
} catch (e) {
  console.error(`cannot read ${jsonPath}: ${e.message}`);
  process.exit(2);
}
if (!Array.isArray(rows)) {
  console.error("expected a JSON array");
  process.exit(2);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ws = await pool.query(
  `SELECT w.id, w.name FROM workspaces w ORDER BY w.created_at DESC LIMIT 1`
);
if (!ws.rows.length) {
  console.error("no workspace found");
  process.exit(1);
}
const workspaceId = ws.rows[0].id;

const passers = rows.filter((r) => r.pass === true);
console.log(
  `workspace: ${ws.rows[0].name} (${workspaceId}) | passers: ${passers.length}/${rows.length}`
);

if (dryRun) {
  for (const p of passers) {
    console.log(`  would insert: ${p.name} | score ${(p.score ?? 0).toFixed(2)} | ${p.affiliate_url ?? "no url"}`);
  }
  await pool.end();
  process.exit(0);
}

for (const p of passers) {
  await pool.query(
    `INSERT INTO product_watchlist (workspace_id, source, source_product_id, name, image_url)
     VALUES ($1, 'ttshop-research', $2, $3, $4)
     ON CONFLICT (workspace_id, source, source_product_id)
     DO UPDATE SET name = EXCLUDED.name`,
    [workspaceId, p.affiliate_url || p.name, p.name, p.image_url || null]
  );
}
console.log(`inserted/updated ${passers.length} watchlist rows (source=ttshop-research)`);
await pool.end();
