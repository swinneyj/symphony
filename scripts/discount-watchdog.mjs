#!/usr/bin/env node
/**
 * Discount watchdog — TikTok Shop price/discount change monitor.
 *
 * Watches every product in the workspace that has a tiktok_product_id
 * (source_type 'link' or 'tiktok_showcase'). Each run:
 *   1. Loads the first connected TikTok account with a shop token (same
 *      lookup as POST /api/products/shop-search / swell-snapshot).
 *   2. Fetches the creator's current SHOWCASE catalog (paginated) → id map.
 *   3. For products NOT in the showcase, falls back to shop_products
 *      keyword search by product name (up to 3 pages), matching by id.
 *   4. Compares current price / sale price / discount % vs the previous
 *      snapshot stored in products.metadata.discountWatch.
 *   5. Prints ALERT lines to stdout ONLY when something changed:
 *        - discount canceled or dropped (the TikTok Shop violation trigger:
 *          a video claiming a discount that no longer exists)
 *        - price changed significantly
 *        - product no longer found in the catalog (likely removed → take
 *          the video down)
 *   6. Updates the snapshot for every product regardless.
 *
 * Cron semantics (mirrors swell-snapshot): stdout stays EMPTY when there is
 * nothing to report (silent); errors go to stderr + a log file and exit
 * non-zero so the scheduler alerts. "No connected account yet" is an
 * expected, silent no-op.
 *
 * Env: DATABASE_URL, TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET.
 * (The BSM wrapper scripts/discount-watchdog-cron.sh supplies these from
 * Bitwarden at run time.)
 */
import { createHmac } from "node:crypto";
import { appendFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { Pool } from "@neondatabase/serverless";

const LOG_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".discount-watchdog.log"
);

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  try {
    appendFileSync(LOG_FILE, line + "\n");
  } catch {
    /* best-effort */
  }
  // stderr only — stdout must stay empty for silent cron delivery
  process.stderr.write(line + "\n");
}

const PAGE_SIZE = 100;
const SHOP_API = "https://open-api.tiktokglobalshop.com";

const APP_KEY = process.env.TIKTOK_SHOP_APP_KEY;
const APP_SECRET = process.env.TIKTOK_SHOP_APP_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

let pool = null;
function getPool() {
  if (!pool) pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  return pool;
}
/** Test hook — replaces the pool (must be called before main()). */
export function __setPool(p) {
  pool = p;
}

function signRequest(appSecret, queryString) {
  return createHmac("sha256", appSecret).update(queryString).digest("hex");
}

async function apiGet(pathName, shopToken, params) {
  const all = {
    app_key: APP_KEY,
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...params,
  };
  const sortedQuery = Object.keys(all)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(all[k])}`)
    .join("&");
  const sign = signRequest(APP_SECRET, sortedQuery);
  const query = new URLSearchParams({ ...all, sign });
  const res = await fetch(
    `${SHOP_API}/${pathName}?${query.toString()}`,
    {
      headers: { "x-tts-access-token": shopToken },
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (json.code && json.code !== 0) {
    throw new Error(`code ${json.code}: ${json.message ?? "?"}`);
  }
  return json;
}

/** Fetch the whole creator showcase catalog → Map(id → raw product). */
async function fetchShowcaseMap(shopToken) {
  const map = new Map();
  let token = "";
  do {
    const params = { page_size: String(PAGE_SIZE), origin: "SHOWCASE" };
    if (token) params.page_token = token;
    const json = await apiGet(
      "affiliate_creator/202405/showcases/products",
      shopToken,
      params
    );
    for (const p of json.data?.products ?? []) {
      if (p?.id != null) map.set(String(p.id), p);
    }
    token = json.data?.next_page_token ?? "";
    if (map.size > 10_000) break; // safety valve
  } while (token);
  return map;
}

/** Search shop_products by name, up to 3 pages, return the product whose id matches. */
async function searchProductById(shopToken, tiktokId, name) {
  const keyword = String(name ?? "").trim().slice(0, 80);
  if (!keyword) return null;
  let token = "";
  for (let page = 0; page < 3; page++) {
    const params = {
      page_size: String(PAGE_SIZE),
      keyword,
      sort_field: "SALE",
      sort_order: "DESC",
    };
    if (token) params.page_token = token;
    const json = await apiGet(
      "affiliate_creator/202509/shop_products",
      shopToken,
      params
    );
    const items = json.data?.products ?? [];
    const hit = items.find((p) => p?.id != null && String(p.id) === String(tiktokId));
    if (hit) return hit;
    token = json.data?.next_page_token ?? "";
    if (!token || items.length === 0) break;
    await new Promise((r) => setTimeout(r, 150)); // be polite
  }
  return null;
}

/** Extract price fields defensively (original_price + sale_price if present). */
export function extractPrice(raw) {
  const price = raw?.price ?? {};
  const orig = price.original_price ?? {};
  const sale = price.sale_price ?? {};
  const num = (v) => {
    if (v == null) return null;
    const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const originalMin = num(orig.minimum_amount);
  const saleMin = num(sale.minimum_amount ?? orig.minimum_amount);
  const currency = sale.currency ?? orig.currency ?? "USD";
  const status = raw?.status ?? {};
  const discountPct =
    originalMin != null && saleMin != null && originalMin > 0
      ? Math.round(((originalMin - saleMin) / originalMin) * 100)
      : null;
  return {
    priceMin: saleMin,
    originalMin,
    currency,
    discountPct,
    hidden: status.is_hidden === true,
    reviewStatus: status.review_status ?? null,
    inventoryStatus: status.inventory_status ?? null,
  };
}

function fmt(n) {
  return n == null ? "?" : `$${Number(n).toFixed(2)}`;
}

function fmtPct(n) {
  return n == null ? "unknown" : `${n}% off`;
}

export { fmt, fmtPct };

// Only run the watchdog when executed directly (not when imported for tests).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main()
    .then((code) => {
      getPool().end().catch(() => {});
      process.exit(code ?? 0);
    })
    .catch((err) => {
      log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
      getPool().end().catch(() => {});
      process.exit(1);
    });
}

export { main };

async function main() {
  if (!APP_KEY || !APP_SECRET || !DATABASE_URL) {
    log(
      "ERROR: missing env (need DATABASE_URL, TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET)"
    );
    return 2;
  }
  // 1. Connected TikTok account with shop token.
  const pool = getPool();
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

  // 2. Watched products.
  const watched = await pool.query(
    `SELECT id, name, price, currency, tiktok_product_id AS "tiktokId",
            source_type AS "sourceType", metadata
       FROM products
      WHERE workspace_id = $1
        AND tiktok_product_id IS NOT NULL
        AND source_type IN ('link', 'tiktok_showcase')`,
    [workspaceId]
  );
  if (watched.rows.length === 0) {
    log("no watchable products (tiktok_product_id) — nothing to do");
    return 0;
  }

  // 3. Current catalog state.
  const showcase = await fetchShowcaseMap(shopToken);
  log(`showcase catalog: ${showcase.size} products; watching ${watched.rows.length}`);

  const alerts = [];
  let checked = 0;
  let failed = 0;

  for (const row of watched.rows) {
    const tiktokId = String(row.tiktokId);
    try {
      let raw = showcase.get(tiktokId);
      if (!raw) {
        raw = await searchProductById(shopToken, tiktokId, row.name);
      }
      const cur = extractPrice(raw ?? {});
      const prev = (row.metadata?.discountWatch ?? null);

      if (raw) {
        checked++;
        // ALERT: discount canceled / dropped.
        if (prev?.found && prev.discountPct != null && cur.discountPct != null) {
          if (cur.discountPct === 0 && prev.discountPct > 0) {
            alerts.push(
              `• 🔴 "${row.name}" — discount GONE (was ${prev.discountPct}% off, now full price ${fmt(cur.priceMin)}). Video claiming a discount is now a violation risk — take it down or edit it.`
            );
          } else if (cur.discountPct < prev.discountPct - 4) {
            alerts.push(
              `• 🟠 "${row.name}" — discount DROPPED ${prev.discountPct}% → ${cur.discountPct}% (now ${fmt(cur.priceMin)}). Verify the video's claim still matches.`
            );
          }
        }
        // ALERT: price moved with no discount context.
        if (prev?.found && prev.discountPct == null && cur.discountPct == null) {
          const moved =
            prev.priceMin != null &&
            cur.priceMin != null &&
            Math.abs(prev.priceMin - cur.priceMin) > 0.005;
          if (moved) {
            alerts.push(
              `• 🟡 "${row.name}" — price changed ${fmt(prev.priceMin)} → ${fmt(cur.priceMin)}. Verify any price claim in the video.`
            );
          }
        }
        // ALERT: product became hidden (removed from sale).
        if (prev?.found && cur.hidden && !prev.hidden) {
          alerts.push(
            `• 🔴 "${row.name}" — product is now HIDDEN on TikTok Shop. Take the video down.`
          );
        }
      } else {
        // Not found in showcase OR search.
        if (prev?.found) {
          alerts.push(
            `• 🔴 "${row.name}" — NO LONGER FOUND in TikTok Shop catalog (removed/delisted). Take the video down.`
          );
        }
      }

      // 4. Update snapshot (found or not — record the state).
      await pool.query(
        `UPDATE products
            SET metadata = jsonb_set(
                  COALESCE(metadata, '{}'::jsonb),
                  '{discountWatch}',
                  $2::jsonb
                )
          WHERE id = $1`,
        [
          row.id,
          JSON.stringify({
            found: !!raw,
            priceMin: cur.priceMin,
            originalMin: cur.originalMin,
            currency: cur.currency,
            discountPct: cur.discountPct,
            hidden: cur.hidden,
            checkedAt: new Date().toISOString(),
          }),
        ]
      );
    } catch (err) {
      failed++;
      log(`WARN: ${row.name} check failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  log(
    `watchdog done: ${checked} checked, ${failed} failed, ${alerts.length} alerts, ${watched.rows.length} watched`
  );

  if (alerts.length > 0) {
    const date = new Date().toISOString().slice(0, 10);
    process.stdout.write(`🛑 TikTok Shop discount watch — ${date}\n${alerts.join("\n")}\n`);
  }
  return 0;
}
