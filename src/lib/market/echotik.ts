/**
 * EchoTik adapter — the primary winning-product source.
 * Docs: https://opendocs.echotik.live  (openapi yaml per endpoint)
 * Auth: Basic (dedicated username/password from the EchoTik API dashboard).
 *
 * Endpoints (all VERIFIED live 2026-08-28):
 *   GET /api/v3/echotik/product/ranklist            — period rankings (day/week/month)
 *   GET /api/v3/echotik/product/list                — deep product search, FULL filter surface (T+1)
 *   GET /api/v3/echotik/product/detail              — business panorama, batch ≤10 product_ids
 *   GET /api/v3/echotik/product/trend               — 180-day daily snapshot series
 *   GET /api/v3/echotik/product/influencer/list     — creators driving a product
 *
 * Response envelope: { code: 0, message, data: <array>, requestId } — data is a
 * DIRECT array (no .list/.products wrapper). page_size is hard-capped at 10, so
 * fetching >10 rows requires paging through page_num.
 */
import type { MarketCreator, MarketProduct, MarketQuery, MarketSource, ProductAnalytics, TrendPoint } from "./types";
import { MissingSourceCredentialsError } from "./types";
import { cacheGet, cacheSet, cacheKey } from "./cache";

const BASE = "https://open.echotik.live";
const PAGE_SIZE = 10; // API hard cap

/** How long to cache each endpoint before re-paying the daily quota.
 *  Ranklist is T+1 (changes once per day) — long TTL is safe.
 *  Filters are exploratory — short TTL dedupes repeated clicks. */
const CACHE_TTL_SECONDS: Record<string, number> = {
  "/api/v3/echotik/product/ranklist": 12 * 3600,
  "/api/v3/echotik/product/list": 15 * 60,
  "/api/v3/echotik/product/detail": 6 * 3600,
  "/api/v3/echotik/product/trend": 6 * 3600,
  "/api/v3/echotik/product/influencer/list": 6 * 3600,
};

type ApiRow = Record<string, unknown>;

function asRows(data: unknown): ApiRow[] {
  return Array.isArray(data) ? (data as ApiRow[]) : [];
}

function authHeader(): string {
  const u = process.env.ECHOTIK_USERNAME;
  const p = process.env.ECHOTIK_PASSWORD;
  if (!u || !p) throw new MissingSourceCredentialsError("echotik", ["ECHOTIK_USERNAME", "ECHOTIK_PASSWORD"]);
  return "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
}

/** Single-page GET; returns the `data` array directly (verified live).
 *  Cached in Vercel KV per endpoint TTL so identical queries don't re-pay
 *  the daily API quota. */
async function get(path: string, params: Record<string, string | number | undefined>): Promise<ApiRow[]> {
  const qs: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs[k] = String(v);
  }
  const query = new URLSearchParams(qs).toString();
  const ttl = CACHE_TTL_SECONDS[path];
  if (ttl) {
    const cached = await cacheGet<ApiRow[]>(cacheKey("echotik", `${path}?${query}`));
    if (cached) return cached;
  }
  const res = await fetch(`${BASE}${path}?${query}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[echotik] ${res.status} ${path}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (json.code !== 0 && json.code !== 200) {
    throw new Error(`[echotik] ${path}: code=${json.code} msg=${json.message ?? "unknown"}`);
  }
  // EchoTik wraps the array directly under `data` (no .list/.products wrapper).
  const rows = asRows(json?.data ?? json);
  if (ttl && rows.length > 0) {
    await cacheSet(cacheKey("echotik", `${path}?${query}`), rows, ttl);
  }
  return rows;
}

/** Page through until `limit` rows collected (page_size hard cap = 10). */
async function getAll(
  path: string,
  params: Record<string, string | number | undefined>,
  limit: number
): Promise<ApiRow[]> {
  const out: ApiRow[] = [];
  let page = 1;
  const per = Math.min(limit, PAGE_SIZE);
  const maxPages = Math.ceil(limit / per) + 1;
  while (out.length < limit && page <= maxPages) {
    const rows = await get(path, { ...params, page_num: page, page_size: per });
    out.push(...rows);
    if (rows.length < per) break;
    page += 1;
  }
  return out.slice(0, limit);
}

// ─── Field name maps (verified) ─────────────────────────────────────────────

const RANK_FIELD: Record<MarketQuery["period"], string> = { day: "1", week: "2", month: "3" };

/** product_sort_field enum (product/list): 1 sales, 2 gmv, 3 price, 4 sales7d,
 *  5 sales30d, 6 gmv7d, 7 gmv30d. */
const SORT_FIELD: Record<string, string> = {
  sales: "1",
  gmv: "2",
  price: "3",
  sales7d: "4",
  sales30d: "5",
  gmv7d: "6",
  gmv30d: "7",
};

// ─── Ranklist (winners feed) ────────────────────────────────────────────────

/** Extract the first cover URL from EchoTik's JSON-encoded cover_url field. */
function firstCoverUrl(coverField: unknown): string | null {
  if (typeof coverField !== "string" || coverField.trim() === "") return null;
  const trimmed = coverField.trim();
  if (trimmed.startsWith("http")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of list) {
      if (item && typeof item.url === "string") return item.url;
    }
  } catch {
    // not JSON — treat the raw string as a URL
  }
  return trimmed.startsWith("http") ? trimmed : null;
}

/**
 * Exchange EchoTik's private stored cover URL for a public signed URL (24h
 * validity). Falls back to scraping the public product page when the signed
 * download endpoint fails. Pass either the parsed URL or the raw cover_url
 * field (JSON-encoded array) — both are handled.
 */
export async function resolveCoverUrl(coverField: string): Promise<string> {
  const rawUrl = firstCoverUrl(coverField) ?? coverField;
  if (!/^https:\/\//.test(rawUrl)) throw new Error("[echotik] invalid cover url");

  const host = new URL(rawUrl).hostname;
  if (!host.includes("volces.com") && !host.includes("echotik.live")) {
    return rawUrl; // already public
  }

  try {
    const data = await get("/api/v3/echotik/batch/cover/download", { cover_urls: rawUrl });
    for (const entry of data) {
      if (entry && typeof entry === "object") {
        const mapped = Object.values(entry)[0];
        if (typeof mapped === "string" && mapped.startsWith("https://")) return mapped;
      }
    }
  } catch {
    // fall through to public page scrape
  }

  const productId = new URL(rawUrl).pathname.match(/\/product-cover\/\d+\/(\d+)_/)?.[1];
  if (!productId) throw new Error("[echotik] could not identify cover product");
  const page = await fetch(`https://www.echotik.live/products/${productId}`, {
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 Symphony/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!page.ok) throw new Error(`[echotik] product page ${page.status}`);
  const html = await page.text();
  const escapedId = productId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`https://cdn\\.echotik\\.live/[^"'<>\\s]+/product-cover/[^"'<>\\s]+/${escapedId}_0\\.(?:webp|jpe?g|png)`)
  );
  if (!match) throw new Error("[echotik] public product page returned no cover");
  return match[0];
}

/** Ranklist → "who climbed fastest" per period. THE winning-product feed.
 * Falls back to the product library when ranking snapshots are briefly
 * unavailable (daily rollover) or the feed errors. */
export async function fetchWinningProducts(query: MarketQuery): Promise<MarketProduct[]> {
  // T+1 data: the freshest completed ranking day is yesterday.
  const periodDays = query.period === "day" ? 1 : query.period === "week" ? 7 : 30;
  const date = new Date(Date.now() - periodDays * 86_400_000).toISOString().slice(0, 10);
  const rankType = RANK_FIELD[query.period] ?? "1";
  try {
    const rows = await getAll(
      "/api/v3/echotik/product/ranklist",
      {
        date,
        region: query.region ?? "US",
        rank_type: rankType,
        product_rank_field: "1", // total_sale_cnt (hot-sales)
        ...(query.category ? { category_id: query.category } : {}),
        ...(query.categoryL2 ? { category_l2_id: query.categoryL2 } : {}),
        ...(query.categoryL3 ? { category_l3_id: query.categoryL3 } : {}),
      },
      query.limit ?? 50
    );
    if (rows.length > 0) {
      return rows.map((r, i) => normalizeRanklist(r, i + 1, query.period, query.region ?? "US"));
    }
  } catch {
    // fall through to the product library
  }
  return searchProducts(query);
}

function normalizeRanklist(r: ApiRow, rank: number, period: MarketQuery["period"], region: string): MarketProduct {
  const price = num(r.spu_avg_price) ?? num(r.min_price);
  const priceMax = num(r.max_price) ?? price;
  return {
    source: "echotik" as MarketSource,
    sourceProductId: String(r.product_id ?? ""),
    name: String(r.product_name ?? "Unknown product"),
    imageUrl: null, // ranklist has no cover; detail/list carries cover_url
    priceMin: price,
    priceMax: priceMax,
    currency: "USD",
    categoryL1: null,
    categoryL2: null,
    categoryL3: null,
    region: strOrNull(r.region) ?? region,
    rank,
    rankPeriod: period,
    sales7d: null,
    sales30d: num(r.total_sale_cnt) ?? null,
    gmv30d: num(r.total_sale_gmv_amt) ?? null,
    growthRate: null,
    commissionRate: num(r.product_commission_rate) ?? null,
    videoCount: num(r.total_video_cnt) ?? null,
    creatorCount: num(r.total_ifl_cnt) ?? null,
    isHot: false,
    momentumScore: null,
    metadata: { raw: r, endpoint: "ranklist" },
  };
}

// ─── Product list (products library, full filter surface) ───────────────────

/**
 * Deep product search mirroring the EchoTik Products Library UI.
 * Filters (verified param names): price band, commission rate, rating (product
 * experience points), review count (comments), influencer/video/video-views
 * counts, total + 30d sales, total + 30d GMV, 7-day sales trend, S-shop
 * (full-managed), free shipping, brand store, local/cross-border shop type,
 * hot flag, on-sale only, sales method (video/live), new-product (first crawl).
 */
export async function searchProducts(query: MarketQuery): Promise<MarketProduct[]> {
  const rows = await getAll(
    "/api/v3/echotik/product/list",
    {
      region: query.region ?? "US",
      ...(query.category ? { category_id: query.category } : {}),
      ...(query.categoryL2 ? { category_l2_id: query.categoryL2 } : {}),
      ...(query.categoryL3 ? { category_l3_id: query.categoryL3 } : {}),
      ...(query.priceMin != null ? { min_spu_avg_price: query.priceMin } : {}),
      ...(query.priceMax != null ? { max_spu_avg_price: query.priceMax } : {}),
      ...(query.commissionMin != null ? { min_product_commission_rate: query.commissionMin } : {}),
      ...(query.commissionMax != null ? { max_product_commission_rate: query.commissionMax } : {}),
      ...(query.influencersMin != null ? { min_total_ifl_cnt: query.influencersMin } : {}),
      ...(query.influencersMax != null ? { max_total_ifl_cnt: query.influencersMax } : {}),
      ...(query.videosMin != null ? { min_total_video_cnt: query.videosMin } : {}),
      ...(query.videosMax != null ? { max_total_video_cnt: query.videosMax } : {}),
      ...(query.viewsMin != null ? { min_total_views_cnt: query.viewsMin } : {}),
      ...(query.viewsMax != null ? { max_total_views_cnt: query.viewsMax } : {}),
      ...(query.ratingMin != null ? { min_product_rating: query.ratingMin } : {}),
      ...(query.ratingMax != null ? { max_product_rating: query.ratingMax } : {}),
      ...(query.reviewsMin != null ? { min_review_count: query.reviewsMin } : {}),
      ...(query.reviewsMax != null ? { max_review_count: query.reviewsMax } : {}),
      ...(query.salesMin != null ? { min_total_sale_cnt: query.salesMin } : {}),
      ...(query.salesMax != null ? { max_total_sale_cnt: query.salesMax } : {}),
      ...(query.sales30dMin != null ? { min_total_sale_30d_cnt: query.sales30dMin } : {}),
      ...(query.sales30dMax != null ? { max_total_sale_30d_cnt: query.sales30dMax } : {}),
      ...(query.gmvMin != null ? { min_total_sale_gmv_amt: query.gmvMin } : {}),
      ...(query.gmvMax != null ? { max_total_sale_gmv_amt: query.gmvMax } : {}),
      ...(query.gmv30dMin != null ? { min_total_sale_gmv_30d_amt: query.gmv30dMin } : {}),
      ...(query.gmv30dMax != null ? { max_total_sale_gmv_30d_amt: query.gmv30dMax } : {}),
      ...(query.salesTrend != null ? { sales_trend_flag: query.salesTrend } : {}),
      ...(query.isSShop != null ? { is_s_shop: query.isSShop ? 1 : 0 } : {}),
      ...(query.freeShipping != null ? { free_shipping: query.freeShipping ? 1 : 0 } : {}),
      ...(query.fromFlag != null ? { from_flag: query.fromFlag } : {}), // 1=local 2=cross-border
      ...(query.isHot != null ? { is_hot: query.isHot ? 1 : 0 } : {}),
      ...(query.brandStore != null ? { shop_type: query.brandStore ? 1 : 0 } : {}),
      ...(query.onSaleOnly ? { off_mark: 0 } : {}), // 0 = on sale (filters out delisted)
      ...(query.salesFlag != null ? { sales_flag: query.salesFlag } : {}), // 1=video 2=live
      ...(query.newProductsDays != null && query.newProductsDays > 0
        ? { min_first_crawl_dt: yyyymmdd(Date.now() - query.newProductsDays * 86_400_000) }
        : {}),
      product_sort_field: SORT_FIELD[query.sortField ?? "sales30d"],
      sort_type: query.sortType === "asc" ? 0 : 1,
    },
    query.limit ?? 50
  );
  return rows.map((r, i) => normalizeLibrary(r, i + 1, query.region ?? "US"));
}

function normalizeLibrary(r: ApiRow, rank: number, region: string): MarketProduct {
  const price = num(r.spu_avg_price) ?? num(r.min_price);
  const priceMax = num(r.max_price) ?? price;
  return {
    source: "echotik" as MarketSource,
    sourceProductId: String(r.product_id ?? ""),
    name: String(r.product_name ?? "Unknown product"),
    imageUrl: firstCoverUrl(r.cover_url) ?? null,
    priceMin: price,
    priceMax: priceMax,
    currency: "USD",
    categoryL1: null,
    categoryL2: null,
    categoryL3: null,
    region: strOrNull(r.region) ?? region,
    rank,
    rankPeriod: "day",
    sales7d: num(r.total_sale_7d_cnt) ?? null,
    sales30d: num(r.total_sale_30d_cnt) ?? num(r.total_sale_cnt) ?? null,
    gmv30d: num(r.total_sale_gmv_30d_amt) ?? num(r.total_sale_gmv_amt) ?? null,
    growthRate: growthFromTrend(r), // derived: 7d vs 30d pace
    commissionRate: num(r.product_commission_rate) ?? null,
    videoCount: num(r.total_video_cnt) ?? null,
    creatorCount: num(r.total_ifl_cnt) ?? null,
    isHot: r.is_hot === 1 || r.is_hot === true,
    momentumScore: null,
    metadata: {
      raw: r,
      endpoint: "list",
      rating: num(r.product_rating) ?? null,
      reviewCount: num(r.review_count) ?? null,
      liveCount: num(r.total_live_cnt) ?? null,
      viewsCount: num(r.total_views_cnt) ?? null,
      salesTrend: num(r.sales_trend_flag) ?? null,
      firstCrawlDate: strOrNull(r.first_crawl_dt),
      isSShop: r.is_s_shop === 1 || r.is_s_shop === true,
      freeShipping: r.free_shipping === 1 || r.free_shipping === true,
      brandStore: r.shop_type === 1 || r.shop_type === true,
      fromFlag: num(r.from_flag) ?? null,
      onSale: r.off_mark === 0,
      sellerId: r.seller_id ?? null,
      saleProps: r.sale_props ?? null,
      discount: num(r.discount) ?? null,
      shippingPrice: num(r.shipping_price) ?? null,
    },
  };
}

/** Approximate growth: 7d daily pace vs 30d daily pace, minus 1. */
function growthFromTrend(r: ApiRow): number | null {
  const s7 = num(r.total_sale_7d_cnt);
  const s30 = num(r.total_sale_30d_cnt);
  if (s7 == null || s30 == null || s30 <= 0) return null;
  return Number(((s7 / 7) / (s30 / 30) - 1).toFixed(3));
}

// ─── Product analytics (drill-down: panorama + trend) ────────────────────────

/**
 * Business panorama for up to 10 products (detail endpoint): rating, reviews,
 * seller, and the 1/7/15/30/60/90-day live/video/influencer/sales/GMV breakdowns.
 */
export async function fetchProductDetails(productIds: string[]): Promise<MarketProduct[]> {
  if (productIds.length === 0) return [];
  const rows = await get("/api/v3/echotik/product/detail", {
    product_ids: productIds.slice(0, 10).join(","),
  });
  return rows.map((r) => normalizeLibrary(r, 1, String(r.region ?? "US")));
}

/** Daily snapshot series (trend endpoint). API rejects start_date ≥179 days back
 * ("must be within 180 days" is strict) — default 170 days to stay inside. */
export async function fetchProductTrend(productId: string, days = 170): Promise<TrendPoint[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const rows = await getAll(
    "/api/v3/echotik/product/trend",
    {
      product_id: productId,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
    },
    200
  );
  return rows
    .map((r) => ({
      date: String(r.dt ?? ""),
      price: num(r.spu_avg_price) ?? null,
      influencers: num(r.total_ifl_cnt) ?? null,
      liveCount: num(r.total_live_cnt) ?? null,
      videoCount: num(r.total_video_cnt) ?? null,
      sales1d: num(r.total_sale_1d_cnt) ?? null,
      salesTotal: num(r.total_sale_cnt) ?? null,
      gmv1d: num(r.total_sale_gmv_1d_amt) ?? null,
      gmvTotal: num(r.total_sale_gmv_amt) ?? null,
    }))
    .filter((t) => t.date);
}

/** Combined drill-down: detail panorama (batch) + trend series. */
export async function fetchProductAnalytics(productId: string): Promise<ProductAnalytics> {
  const [detail] = await fetchProductDetails([productId]);
  const trend = await fetchProductTrend(productId);
  const raw = (detail?.metadata?.raw ?? {}) as ApiRow;
  const periods = [1, 7, 15, 30, 60, 90].map((p) => ({
    period: p,
    sales: num(raw[`total_sale_${p}d_cnt`]) ?? null,
    gmv: num(raw[`total_sale_gmv_${p}d_amt`]) ?? null,
    videoCnt: num(raw[`total_video_${p}d_cnt`]) ?? null,
    videoSales: num(raw[`total_video_sale_${p}d_cnt`]) ?? null,
    liveCnt: num(raw[`total_live_${p}d_cnt`]) ?? null,
    liveSales: num(raw[`total_live_sale_${p}d_cnt`]) ?? null,
    // influencer period splits are live/video-only; sum both.
    influencers:
      num(raw[`total_ifl_live_${p}d_cnt`]) ?? num(raw[`total_ifl_video_${p}d_cnt`]) ?? null,
  }));
  return {
    productId,
    name: detail?.name ?? null,
    imageUrl: detail?.imageUrl ?? null,
    priceMin: detail?.priceMin ?? null,
    priceMax: detail?.priceMax ?? null,
    commissionRate: detail?.commissionRate ?? null,
    rating: num(raw.product_rating) ?? null,
    reviewCount: num(raw.review_count) ?? null,
    sellerId: strOrNull(raw.seller_id),
    salesTrend: num(raw.sales_trend_flag) ?? null,
    firstCrawlDate: strOrNull(raw.first_crawl_dt),
    isSShop: raw.is_s_shop === 1 || raw.is_s_shop === true,
    freeShipping: raw.free_shipping === 1 || raw.free_shipping === true,
    brandStore: raw.shop_type === 1 || raw.shop_type === true,
    fromFlag: num(raw.from_flag) ?? null,
    totalSales: num(raw.total_sale_cnt) ?? null,
    totalGmv: num(raw.total_sale_gmv_amt) ?? null,
    panorama: periods,
    trend,
  };
}

// ─── Creators (affiliate layer) ──────────────────────────────────────────────

/** Creators driving a product (product/influencer/list). */
export async function fetchProductCreators(
  sourceProductId: string,
  limit = 20
): Promise<MarketCreator[]> {
  const rows = await getAll(
    "/api/v3/echotik/product/influencer/list",
    {
      product_id: sourceProductId,
      product_influencer_sort_field: 1, // TODO_VERIFY: enum (1 likely by sales)
      sort_type: 1,
    },
    limit
  );
  return rows.map((r) => ({
    source: "echotik" as MarketSource,
    sourceCreatorId: String(r?.user_id ?? r?.unique_id ?? r?.id ?? ""),
    name: String(r?.nickname ?? r?.unique_id ?? r?.name ?? "Unknown"),
    avatarUrl: strOrNull(r?.avatar ?? r?.avatar_url),
    followers: num(r?.follower_count ?? r?.followers),
    engagementRate: num(r?.engagement_rate ?? r?.interaction_rate),
    region: strOrNull(r?.region),
    rating: num(r?.rating ?? r?.score),
    videoCount: num(r?.video_count ?? r?.product_video_count),
    salesForProduct: num(r?.sales ?? r?.product_sales),
    metadata: { raw: r, endpoint: "influencer/list" },
  }));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

function yyyymmdd(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
