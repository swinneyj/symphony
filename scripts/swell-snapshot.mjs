#!/usr/bin/env node
/**
 * Swell snapshot — daily TikTok Shop SALE-rank snapshot (the Swell meter's
 * data feed). Mirrors src/lib/market/index.ts ingestMarketRows() semantics
 * (rank trajectory → momentum_score), but for the free tiktok_shop source:
 * the API's own SALE sort IS the ranking.
 *
 * Flow:
 *   1. Load the first connected TikTok account with a shop token
 *      (social_accounts.metadata.shop.accessToken — same lookup as
 *      POST /api/products/shop-search).
 *   2. Page through Get Shop Products sorted by SALE DESC, top 100.
 *   3. Upsert into market_products (source='tiktok_shop',
 *      snapshot_date = today, rank = 1-based position), computing
 *      momentum_score vs the most recent prior snapshot.
 *
 * Cron semantics: stdout stays EMPTY on success (silent); errors go to
 * stderr + a log file and exit non-zero so the scheduler alerts. "No
 * connected account yet" is an expected, silent no-op.
 *
 * Env: DATABASE_URL, TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET.
 * (The BSM wrapper scripts/swell-snapshot-cron.sh supplies these from
 * Bitwarden at run time.)
 */
import { createHmac } from "node:crypto";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "@neondatabase/serverless";

const LOG_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".swell-snapshot.log"
);

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  try {
    appendFileSync(LOG_FILE, line + "\n");
  } catch {
    /* log file is best-effort */
  }
  // stderr only — stdout must stay empty for silent cron delivery
  process.stderr.write(line + "\n");
}

const TOP_N = 100;
const PAGE_SIZE = 100;

const APP_KEY = process.env.TIKTOK_SHOP_APP_KEY;
const APP_SECRET = process.env.TIKTOK_SHOP_APP_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (!APP_KEY || !APP_SECRET || !DATABASE_URL) {
  log(
    "ERROR: missing env (need DATABASE_URL, TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET)"
  );
  process.exit(1);
}

function signRequest(appSecret, queryString) {
  return createHmac("sha256", appSecret).update(queryString).digest("hex");
}

/** Page through Get Shop Products (SALE DESC) collecting top-N products. */
async function fetchTopProducts(shopToken, pageToken = "") {
  const params = {
    app_key: APP_KEY,
    timestamp: String(Math.floor(Date.now() / 1000)),
    page_size: String(PAGE_SIZE),
    sort_field: "SALE",
    sort_order: "DESC",
  };
  if (pageToken) params.page_token = pageToken;
  const sortedQuery = Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join("&");
  const sign = signRequest(APP_SECRET, sortedQuery);

  const query = new URLSearchParams({ ...params, sign });
  const res = await fetch(
    `https://open-api.tiktokglobalshop.com/affiliate_creator/202509/shop_products?${query.toString()}`,
    {
      headers: { "x-tts-access-token": shopToken },
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`shop_products HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (json.code && json.code !== 0) {
    throw new Error(`shop_products code ${json.code}: ${json.message ?? "?"}`);
  }
  return {
    products: json.data?.products ?? [],
    nextPageToken: json.data?.next_page_token ?? "",
  };
}

/** Parse a price amount (string/number, possibly "min-max") into [min, max]. */
function parsePrice(amount) {
  if (amount == null) return [null, null];
  const s = String(amount).replace(/[^0-9.\-]/g, "");
  const parts = s.split("-");
  const nums = parts.map((p) => {
    const n = Number(p);
    return Number.isFinite(n) ? n : null;
  });
  return [nums[0] ?? null, nums.length > 1 ? nums[1] ?? nums[0] : nums[0]];
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });

async function main() {
  // 1. Find a connected TikTok account with a shop token.
  const acct = await pool.query(
    `SELECT workspace_id AS "workspaceId",
            metadata->'shop'->>'accessToken' AS "shopToken"
       FROM social_accounts
      WHERE platform = 'tiktok'
        AND status = 'connected'
        AND metadata->'shop'->>'accessToken' IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 1`
  );
  const shopToken = acct.rows[0]?.shopToken;
  if (!shopToken) {
    log("no connected TikTok Shop account yet — skipping (expected until Connect)");
    return 0;
  }
  const workspaceId = acct.rows[0].workspaceId;

  // 2. Page top-N by SALE.
  const products = [];
  let pageToken = "";
  while (products.length < TOP_N) {
    const page = await fetchTopProducts(shopToken, pageToken);
    products.push(...page.products);
    if (!page.nextPageToken || page.products.length === 0) break;
    pageToken = page.nextPageToken;
  }
  const top = products.slice(0, TOP_N);
  if (top.length === 0) {
    log("ERROR: SALE fetch returned zero products");
    process.exit(1);
  }

  // 3. Map to market_products rows (rank = 1-based position).
  const today = new Date();
  const rows = top.map((p, i) => {
    const [priceMin, priceMax] = parsePrice(p.price?.original_price?.minimum_amount);
    return {
      sourceProductId: String(p.id),
      name: String(p.title ?? "Untitled").slice(0, 300),
      imageUrl: p.main_images?.[0]?.url ?? null,
      priceMin,
      priceMax,
      currency: p.price?.original_price?.currency ?? "USD",
      rank: i + 1,
      metadata: { detailLink: p.detail_link ?? null, sellerName: p.shop?.name ?? null },
    };
  });

  // 4. Prior ranks → momentum (prev − cur; positive = climbed).
  const ids = rows.map((r) => r.sourceProductId);
  const prior = await pool.query(
    `SELECT DISTINCT ON (source_product_id) source_product_id, rank
       FROM market_products
      WHERE workspace_id = $1
        AND source = 'tiktok_shop'
        AND source_product_id = ANY($2)
        AND snapshot_date < $3::date
      ORDER BY source_product_id, snapshot_date DESC`,
    [workspaceId, ids, today.toISOString().slice(0, 10)]
  );
  const prevRank = new Map(prior.rows.map((r) => [r.source_product_id, r.rank]));

  const out = rows.map((r) => ({
    ...r,
    momentum:
      r.rank != null && prevRank.has(r.sourceProductId)
        ? Number((prevRank.get(r.sourceProductId) - r.rank).toFixed(2))
        : null,
  }));

  // 5. Batch upsert (single statement, parallel unnest).
  const dateStr = today.toISOString().slice(0, 10);
  await pool.query(
    `INSERT INTO market_products
       (workspace_id, source, source_product_id, name, image_url,
        price_min, price_max, currency, rank, rank_period,
        momentum_score, snapshot_date, metadata)
     SELECT $1::uuid, 'tiktok_shop',
            unnest($2::text[]), unnest($3::text[]), unnest($4::text[]),
            unnest($5::numeric[]), unnest($6::numeric[]), unnest($7::text[]),
            unnest($8::int[]), 'day', unnest($9::numeric[]),
            $10::date, unnest($11::text[])::jsonb
     ON CONFLICT (source, source_product_id, snapshot_date) DO UPDATE SET
       name = EXCLUDED.name,
       image_url = EXCLUDED.image_url,
       price_min = EXCLUDED.price_min,
       price_max = EXCLUDED.price_max,
       currency = EXCLUDED.currency,
       rank = EXCLUDED.rank,
       momentum_score = EXCLUDED.momentum_score,
       metadata = EXCLUDED.metadata`,
    [
      workspaceId,
      out.map((r) => r.sourceProductId),
      out.map((r) => r.name),
      out.map((r) => r.imageUrl ?? ""),
      out.map((r) => r.priceMin ?? 0),
      out.map((r) => r.priceMax ?? r.priceMin ?? 0),
      out.map((r) => r.currency),
      out.map((r) => r.rank),
      out.map((r) => (r.momentum == null ? null : r.momentum)),
      dateStr,
      out.map((r) => JSON.stringify(r.metadata)),
    ]
  );

  log(
    `snapshotted ${out.length} products (workspace ${workspaceId}, ${dateStr}, ` +
      `${out.filter((r) => r.momentum != null && r.momentum > 0).length} climbers)`
  );
  return 0;
}

main()
  .then((code) => {
    pool.end().catch(() => {});
    process.exit(code ?? 0);
  })
  .catch((err) => {
    log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    pool.end().catch(() => {});
    process.exit(1);
  });
