#!/usr/bin/env node
/**
 * load-kalodata-market.mjs — ingest Kalodata trial exports into Symphony market tables.
 *
 * Reads a raw/dayN directory (products.json, creators.json) and upserts into
 * market_products + market_creators (source='kalodata'). Idempotent: deletes
 * the day's rows first (no UNIQUE constraint on the tables), then bulk-inserts.
 *
 * Usage:
 *   node scripts/load-kalodata-market.mjs <daydir> [--dry-run]
 *
 * Env: DATABASE_URL (from BWS at run time). Run from repo root (ESM cwd).
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";

const [dayDir, ...rest] = process.argv.slice(2);
const dryRun = rest.includes("--dry-run");
const dateIdx = rest.indexOf("--date");
const explicitDate = dateIdx >= 0 ? rest[dateIdx + 1] : null;
if (!dayDir) {
  console.error("usage: node scripts/load-kalodata-market.mjs <daydir> [--date YYYY-MM-DD] [--dry-run]");
  process.exit(2);
}

// --- helpers ---------------------------------------------------------------
function readJson(p) {
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(raw) ? raw : raw.data ?? raw.list ?? raw.items ?? [];
  } catch (e) {
    console.error(`cannot read ${p}: ${e.message}`);
    process.exit(2);
  }
}
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};
function parsePrice(v) {
  if (v === null || v === undefined || v === "") return [null, null];
  const s = String(v);
  const m = s.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (m) return [num(m[1]), num(m[2])];
  return [num(v), num(v)];
}
function dayDate(dir) {
  // snapshot date = products.json mtime date (export creation day)
  try {
    const st = statSync(join(dir, "products.json"));
    return new Date(st.mtime).toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
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
const snap = explicitDate ?? dayDate(dayDir);

// --- read exports ----------------------------------------------------------
const products = readJson(join(dayDir, "products.json"));
const creators = readJson(join(dayDir, "creators.json"));

const pRows = products.map((p, i) => {
  const [pmin, pmax] = parsePrice(p.unit_price);
  return {
    workspace_id: workspaceId,
    source: "kalodata",
    source_product_id: String(p.product_id),
    name: String(p.product_name ?? "unknown"),
    image_url: p.master_image_url ?? null,
    price_min: pmin,
    price_max: pmax,
    currency: "USD",
    category_l1: null,
    category_l2: null,
    category_l3: null,
    region: "US",
    rank: i + 1,
    rank_period: "30d",
    sales_7d: null,
    sales_30d: num(p.sales_volumn),
    gmv_30d: num(p.revenue),
    growth_rate: num(p.revenue_growth_rate),
    commission_rate: num(p.commission_rate),
    video_count: null,
    creator_count: null,
    is_hot: null,
    product_id: null,
    snapshot_date: snap,
    metadata: { ...p, _export: "top_products", _note: "revenue=GMV, sales_volumn=units, 30d period (Kalodata default product ranking)" },
  };
});

const cRows = creators.map((c) => ({
  workspace_id: workspaceId,
  source: "kalodata",
  source_creator_id: String(c.creator_id),
  name: String(c.creator_nickname ?? c.creator_handle ?? "unknown"),
  avatar_url: null,
  followers: num(c.creator_followers),
  engagement_rate: null,
  region: "US",
  rating: null,
  snapshot_date: snap,
  metadata: { ...c, _export: "creators" },
}));

console.log(
  `workspace: ${ws.rows[0].name} | snapshot ${snap} | products ${pRows.length} | creators ${cRows.length} | ${dryRun ? "DRY-RUN" : "WRITE"}`
);
if (dryRun) {
  console.log("  sample product:", pRows[0]?.name.slice(0, 60), "| gmv", pRows[0]?.gmv_30d, "| units", pRows[0]?.sales_30d, "| rank", pRows[0]?.rank);
  console.log("  sample creator:", cRows[0]?.name, "| followers", cRows[0]?.followers);
  await pool.end();
  process.exit(0);
}

// --- idempotent delete-then-insert (no UNIQUE constraint exists) -----------
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const del = await client.query(
    `DELETE FROM market_products WHERE workspace_id = $1 AND source = 'kalodata' AND snapshot_date = $2`,
    [workspaceId, snap]
  );
  await client.query(
    `DELETE FROM market_creators WHERE workspace_id = $1 AND source = 'kalodata' AND snapshot_date = $2`,
    [workspaceId, snap]
  );

  const insertP = async (rows) => {
    if (!rows.length) return 0;
    const cols = [
      "workspace_id","source","source_product_id","name","image_url","price_min","price_max",
      "currency","category_l1","category_l2","category_l3","region","rank","rank_period",
      "sales_7d","sales_30d","gmv_30d","growth_rate","commission_rate","video_count",
      "creator_count","is_hot","product_id","snapshot_date","metadata",
    ];
    const params = [];
    const values = rows.map((r) => {
      const ph = cols.map((c) => {
        params.push(r[c]);
        return `$${params.length}`;
      });
      params.push(new Date());
      ph.push(`$${params.length}`);
      return `(${ph.join(",")})`;
    });
    await client.query(
      `INSERT INTO market_products (${cols.join(",")}, created_at) VALUES ${values.join(",")}`,
      params
    );
    return rows.length;
  };
  const insertC = async (rows) => {
    if (!rows.length) return 0;
    const cols = [
      "workspace_id","source","source_creator_id","name","avatar_url","followers",
      "engagement_rate","region","rating","snapshot_date","metadata",
    ];
    const params = [];
    const values = rows.map((r) => {
      const ph = cols.map((c) => {
        params.push(r[c]);
        return `$${params.length}`;
      });
      params.push(new Date());
      ph.push(`$${params.length}`);
      return `(${ph.join(",")})`;
    });
    await client.query(
      `INSERT INTO market_creators (${cols.join(",")}, created_at) VALUES ${values.join(",")}`,
      params
    );
    return rows.length;
  };

  const np = await insertP(pRows);
  const nc = await insertC(cRows);
  await client.query("COMMIT");
  console.log(`inserted ${np} products, ${nc} creators (replaced ${del.rowCount} prior rows for ${snap})`);
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
}
await pool.end();
