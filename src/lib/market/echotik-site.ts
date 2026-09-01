/**
 * EchoTik WEBSITE adapter — the replacement for the paid API platform.
 *
 * The user pays for the EchoTik website plan ($9.9/mo), NOT the API platform
 * ($139/mo). The site's internal API (echotik.live/api/v1/data/*) exposes the
 * same data — product detail, video lists with Promote (is_promote), influencer
 * lists, seller/brand products, leaderboards, search — authenticated with the
 * website session token instead of API Basic auth.
 *
 * AUTH (verified live 2026-08-29):
 *   Authorization: Bearer <token>   — token is the site's `token` cookie,
 *                                     URL-decoded (cookie stores %7C for |)
 *   x-lang: en, x-currency: USD, x-region: US
 *   No cookies needed. No Cloudflare wall on these endpoints.
 *
 * AUTH for influencer/seller LEADERBOARDS (verified live 2026-09-01):
 *   The /influencers/leaderboard/* and /sellers/leaderboard/* endpoints are
 *   NEWER and require the full session: the `token` cookie (via Cookie
 *   header) + x-region header. Bearer-only gets an HTML 500. Region is NOT a
 *   query param on these — it's the `x-region: US` header (or region cookie).
 *   Envelope quirk: success returns code=100004 WITH data (not code=0). The
 *   filters endpoint (/influencers/leaderboard/filters) works Bearer-only and
 *   returns the available time_type/time_range ids (daily=YYYYMMDD,
 *   weekly/monthly=YYYYMMDD-YYYYMMDD) + influencer_role/category filters.
 *   ECHOTIK_WEB_COOKIE (full Netscape cookie file) must be set in env.
 *
 * Envelope: { code: 0, msg: "ok", data: <array|object>, meta: { total,
 *   current_page, last_page, per_page } }. Detail endpoints return `data` as a
 *   single OBJECT (not array). Values are FORMATTED STRINGS ("159.71K",
 *   "$1.26M", "5.0", "0%") — parsed back to numbers here.
 *
 * Endpoints (all VERIFIED live 2026-08-29):
 *   GET /api/v1/data/products/leaderboard/top-sold     — winners feed (days=1/7/30)
 *   GET /api/v1/data/products/leaderboard/hot-sell     — hot products (days=1/7/30)
 *   GET /api/v1/data/products/leaderboard/news-burst   — new products (days=1/7/30)
 *   GET /api/v1/data/products                          — library search + filters
 *   GET /api/v1/data/search/products?keyword=          — keyword search
 *   GET /api/v1/data/products/{id}                     — product detail (OBJECT)
 *   GET /api/v1/data/products/{id}/videos              — videos w/ is_promote + is_ai_video
 *   GET /api/v1/data/products/{id}/influencers         — creators driving the product
 *   GET /api/v1/data/sellers/{id}/products             — brand → all products
 *
 * Field names differ from the API platform (open.echotik.live) — everything is
 * normalized to the shared Market* types so the UI/routes/DB are unchanged.
 */
import type { MarketCreator, MarketInfluencer, MarketProduct, MarketProductVideo, MarketQuery, MarketShop, MarketSource, ProductAnalytics, TrendPoint } from "./types";
import { MissingSourceCredentialsError } from "./types";
import { cacheGet, cacheSet, cacheKey } from "./cache";

const BASE = "https://echotik.live/api/v1/data";

/** 1/7/30d leaderboard scopes — matches the site's day/week/month tabs. */
const DAYS: Record<MarketQuery["period"], number> = { day: 1, week: 7, month: 30 };

/** Site API is fast and quota-free (website plan) — moderate TTLs keep it fresh. */
const CACHE_TTL_SECONDS: Record<string, number> = {
  "/products/leaderboard/top-sold": 4 * 3600,
  "/products/leaderboard/hot-sell": 4 * 3600,
  "/products/leaderboard/news-burst": 4 * 3600,
  "/products": 10 * 60,
  "/search/products": 10 * 60,
  "/products/{id}": 6 * 3600,
  "/products/{id}/videos": 6 * 3600,
  "/products/{id}/influencers": 6 * 3600,
  "/sellers/{id}/products": 6 * 3600,
  "/search/influencers": 30 * 60,
  "/search/sellers": 30 * 60,
  "/search/videos": 30 * 60,
  "/influencers/{id}/products": 6 * 3600,
  // Recency pull ("what are they pushing now") — short TTL keeps it fresh.
  "/influencers/{id}/videos": 30 * 60,
};

type ApiRow = Record<string, unknown>;

/** Parse the site's formatted numbers: "159.71K" → 159710, "$1.26M" → 1260000,
 *  "5.0" → 5, "0%" → 0, "1,200" → 1200, "560" → 560. Returns null on junk. */
function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().replace(/[$,\s]/g, "").replace(/%$/, "");
  if (s === "" || s === "-" || s === "N/A") return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)([KMB]?)$/i);
  if (!m) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  const mult = m[2] ? { K: 1e3, M: 1e6, B: 1e9 }[m[2].toUpperCase()]! : 1;
  const n = Number(m[1]) * mult;
  return Number.isFinite(n) ? n : null;
}

/** Parse "15%" → 0.15 (fraction, matching the app's commissionRate convention). */
function parsePct(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().replace(/%$/, "");
  if (s === "" || s === "-" || s === "N/A") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n / 100 : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

/** Site region values are objects { id, name, key } — pull the key ("US"). */
function regionKey(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const r = v as Record<string, unknown>;
    return str(r.key) ?? str(r.id) ?? null;
  }
  return null;
}

/** "Beauty & Personal Care/Fragrance/Unisex Fragrance" → [L1, L2, L3]. */
function splitCategories(v: unknown): [string | null, string | null, string | null] {
  const s = str(v);
  if (!s) return [null, null, null];
  const parts = s.split("/").map((p) => p.trim()).filter(Boolean);
  return [parts[0] ?? null, parts[1] ?? null, parts[2] ?? null];
}

function authHeaders(): Record<string, string> {
  const token = process.env.ECHOTIK_WEB_TOKEN;
  if (!token) {
    throw new MissingSourceCredentialsError("echotik", ["ECHOTIK_WEB_TOKEN"]);
  }
  return {
    Authorization: `Bearer ${token}`,
    "x-lang": "en",
    "x-currency": "USD",
    "x-region": "US",
    Accept: "application/json",
  };
}

/**
 * Headers for the NEWER leaderboard endpoints (/influencers/leaderboard/*).
 * These auth by session COOKIE (not just Bearer) — ECHOTIK_WEB_COOKIE is the
 * full Netscape cookie file re-exported from the browser (28d expiry, same
 * cadence as the token). `x-region` here is the actual region selector (the
 * query param is ignored/rejected on these endpoints).
 */
function leaderboardHeaders(): Record<string, string> {
  const cookie = process.env.ECHOTIK_WEB_COOKIE;
  if (!cookie) {
    throw new MissingSourceCredentialsError("echotik", ["ECHOTIK_WEB_COOKIE"]);
  }
  const cookieHeader = cookie
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("\t"))
    .filter((p) => p.length >= 7)
    .map((p) => `${p[5]}=${p[6]}`)
    .join("; ");
  return {
    ...authHeaders(),
    Cookie: cookieHeader,
    "Content-Type": "application/json",
    "x-secondary-currency": "CNY",
    "X-User-Id": "",
  };
}

/**
 * Map a concrete API path back to its `{id}` template so the TTL table
 * matches detail endpoints. Verified live 2026-08-29: without this, `/products/123`
 * never matched the `/products/{id}` key → drill-down calls (detail, videos,
 * creators, seller/influencer products) bypassed KV entirely and re-burned
 * site quota (1,000 detail views/day) on every click.
 */
function ttlFor(path: string): number | undefined {
  const template = path.replace(/\/\d+/g, "/{id}");
  return CACHE_TTL_SECONDS[template] ?? CACHE_TTL_SECONDS[path];
}

/** Single-page GET; `data` may be an array (lists) or object (detail). Cached. */
async function get(
  path: string,
  params: Record<string, string | number | undefined>
): Promise<{ rows: ApiRow[]; object: ApiRow | null; meta: Record<string, unknown> }> {
  const qs: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs[k] = String(v);
  }
  const query = new URLSearchParams(qs).toString();
  const ttl = ttlFor(path);
  if (ttl) {
    const cached = await cacheGet<{ rows: ApiRow[]; object: ApiRow | null; meta: Record<string, unknown> }>(
      cacheKey("echotik-site", `${path}?${query}`)
    );
    if (cached) return cached;
  }

  const res = await fetch(`${BASE}${path}?${query}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[echotik-site] ${res.status} ${path}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (json.code !== 0) {
    // 100004 = session expired/unauthorized — the user must re-export the cookie.
    if (json.code === 100004) {
      throw new Error("[echotik-site] session expired — re-export the EchoTik website cookie (ECHOTIK_WEB_TOKEN)");
    }
    throw new Error(`[echotik-site] ${path}: code=${json.code} msg=${json.msg ?? "unknown"}`);
  }
  const rows = Array.isArray(json.data) ? (json.data as ApiRow[]) : [];
  const object = json.data && typeof json.data === "object" && !Array.isArray(json.data) ? (json.data as ApiRow) : null;
  const meta = (json.meta ?? {}) as Record<string, unknown>;
  if (ttl && (rows.length > 0 || object)) {
    await cacheSet(cacheKey("echotik-site", `${path}?${query}`), { rows, object, meta }, ttl);
  }
  return { rows, object, meta };
}

/** Page through until `limit` rows collected (per_page up to 50 verified). */
async function getAll(
  path: string,
  params: Record<string, string | number | undefined>,
  limit: number
): Promise<ApiRow[]> {
  const out: ApiRow[] = [];
  let page = 1;
  const per = Math.min(Math.max(limit, 10), 50);
  while (out.length < limit && page <= 20) {
    const { rows } = await get(path, { ...params, page, per_page: per });
    out.push(...rows);
    if (rows.length < per) break;
    page += 1;
  }
  return out.slice(0, limit);
}

// ─── Winners feed (leaderboard) ─────────────────────────────────────────────

/** Normalize a leaderboard row (top-sold/hot-sell/news-burst all share shape). */
function normalizeLeaderboard(r: ApiRow, rank: number, period: MarketQuery["period"], region: string): MarketProduct {
  const price = parseNum(r.avg_price) ?? parseNum(r.real_price) ?? parseNum(r.min_price);
  const priceMax = parseNum(r.max_price) ?? price;
  const [catL1, catL2, catL3] = splitCategories(r.categories ?? r.category);
  const seller = typeof r.seller === "object" && r.seller ? (r.seller as Record<string, unknown>) : null;
  return {
    source: "echotik" as MarketSource,
    sourceProductId: String(r.product_id ?? ""),
    name: String(r.product_name ?? "Unknown product"),
    imageUrl: str(r.cover_url) ?? null, // site covers are already public CDN URLs
    priceMin: price,
    priceMax: priceMax,
    currency: "USD",
    categoryL1: catL1,
    categoryL2: catL2,
    categoryL3: catL3,
    region: regionKey(r.region) ?? region,
    rank,
    rankPeriod: period,
    sales7d: null,
    sales30d: parseNum(r.total_sale_cnt) ?? null,
    gmv30d: parseNum(r.total_gmv_amt) ?? parseNum(r.total_sale_gmv_amt) ?? null,
    growthRate: null,
    commissionRate: parsePct(r.commission),
    videoCount: parseNum(r.total_video_cnt) ?? null,
    creatorCount: parseNum(r.influencers_count) ?? parseNum(r.total_ifl_cnt) ?? null,
    isHot: r.is_hot === 1 || r.is_hot === true,
    momentumScore: null,
    metadata: {
      raw: r,
      endpoint: "site/leaderboard",
      sellerId: seller ? str(seller.seller_id) : null,
      sellerName: seller ? str(seller.seller_name) : null,
      reviewCount: parseNum(r.review_count),
      productRating: parseNum(r.product_rating),
      conversionRate: parsePct(r.conversion_rate),
    },
  };
}

/** Winners feed: top-sold by period (day/week/month → days=1/7/30). */
export async function fetchWinningProducts(query: MarketQuery): Promise<MarketProduct[]> {
  const days = DAYS[query.period] ?? 7;
  const rows = await getAll(
    `/products/leaderboard/top-sold`,
    {
      region: query.region ?? "US",
      days,
      ...(query.category ? { category_id: query.category } : {}),
    },
    query.limit ?? 50
  );
  return rows.map((r, i) => normalizeLeaderboard(r, i + 1, query.period, query.region ?? "US"));
}

// ─── Product library (search + filters) ─────────────────────────────────────

/**
 * Product library mirroring the site's Products page. Supports keyword search
 * (via /search/products) plus the verified filter params: category_id,
 * min_price/max_price, sort/order (total_sale_cnt, total_gmv_amt,
 * total_video_cnt, influencers_count — sale_30d/gmv_30d sort verified absent).
 */
export async function searchProducts(query: MarketQuery): Promise<MarketProduct[]> {
  const region = query.region ?? "US";
  const sortOrder =
    query.sortField === "sales" ? "total_sale_cnt" :
    query.sortField === "gmv" ? "total_gmv_amt" :
    query.sortField === "price" ? "avg_price" :
    query.sortField === "sales7d" ? "total_sale_cnt" :
    query.sortField === "gmv7d" ? "total_gmv_amt" : "total_sale_cnt";

  // Keyword search is a separate endpoint; everything else uses the library.
  if (query.keyword) {
    const rows = await getAll(
      "/search/products",
      { keyword: query.keyword, region },
      query.limit ?? 50
    );
    return rows.map((r, i) => normalizeLeaderboard(r, i + 1, query.period ?? "day", region));
  }

  const rows = await getAll(
    "/products",
    {
      region,
      ...(query.category ? { category_id: query.category } : {}),
      ...(query.priceMin != null ? { min_price: query.priceMin } : {}),
      ...(query.priceMax != null ? { max_price: query.priceMax } : {}),
      sort: query.sortType === "asc" ? "asc" : "desc",
      order: sortOrder,
    },
    query.limit ?? 50
  );
  return rows.map((r, i) => normalizeLeaderboard(r, i + 1, query.period ?? "day", region));
}

// ─── Product detail + analytics ─────────────────────────────────────────────

function normalizeDetail(d: ApiRow): ProductAnalytics {
  const [catL1, catL2, catL3] = splitCategories(d.categories);
  const seller = typeof d.seller === "object" && d.seller ? (d.seller as Record<string, unknown>) : null;
  const labels = typeof d.labels === "object" && d.labels ? (d.labels as Record<string, unknown>) : null;
  const images = Array.isArray(d.images) ? (d.images as unknown[]) : [];

  // Panorama: the site detail carries total + 30d breakdowns (not 1/7/15/60/90).
  const panorama: ProductAnalytics["panorama"] = [
    {
      period: 0,
      sales: parseNum(d.sale_cnt),
      gmv: parseNum(d.gmv_amt),
      videoCnt: parseNum(d.total_video_cnt),
      videoSales: null,
      liveCnt: parseNum(d.total_live_cnt),
      liveSales: null,
      influencers: parseNum(d.total_ifl_cnt),
    },
    {
      period: 30,
      sales: parseNum(d.sale_30d_cnt),
      gmv: parseNum(d.gmv_30d_amt),
      videoCnt: parseNum(d.video_30d_cnt),
      videoSales: null,
      liveCnt: null,
      liveSales: null,
      influencers: parseNum(d.ifl_30d_cnt),
    },
  ];

  return {
    productId: String(d.product_id ?? ""),
    name: str(d.product_name),
    imageUrl: typeof images[0] === "string" ? images[0] : null,
    priceMin: parseNum(d.min_price) ?? parseNum(d.price),
    priceMax: parseNum(d.max_price) ?? parseNum(d.price),
    commissionRate: parsePct(d.commission),
    rating: parseNum(labels?.rating ?? d.product_rating),
    reviewCount: parseNum(d.review_count),
    sellerId: seller ? str(seller.seller_id) : null,
    salesTrend: null,
    firstCrawlDate: str(d.first_time)?.slice(0, 10).replace(/-/g, "") ?? null,
    isSShop: d.is_s_shop === "1" || d.is_s_shop === 1 || d.is_s_shop === true,
    freeShipping: labels?.is_free_shipping === 1 || labels?.is_free_shipping === "1",
    brandStore: false,
    fromFlag: null,
    totalSales: parseNum(d.sale_cnt),
    totalGmv: parseNum(d.gmv_amt),
    panorama,
    trend: [] as TrendPoint[], // site API has no 180-day series; app builds its own
  };
}

/** Product detail (business panorama). */
export async function fetchProductDetails(ids: string[]): Promise<ProductAnalytics[]> {
  const out: ProductAnalytics[] = [];
  for (const id of ids.slice(0, 10)) {
    const { object } = await get(`/products/${id}`, {});
    if (object) out.push(normalizeDetail(object));
  }
  return out;
}

/** Per-product drill-down: detail (site API has no trend series endpoint). */
export async function fetchProductAnalytics(sourceProductId: string): Promise<ProductAnalytics> {
  const { object } = await get(`/products/${sourceProductId}`, {});
  if (!object) throw new Error(`[echotik-site] product detail empty for ${sourceProductId}`);
  return normalizeDetail(object);
}

// ─── Creators ───────────────────────────────────────────────────────────────

function normalizeCreator(r: ApiRow): MarketCreator {
  const region = regionKey(r.region);
  return {
    source: "echotik" as MarketSource,
    sourceCreatorId: String(r.influencer_id ?? ""),
    name: str(r.unique_id) ?? str(r.influencer_name) ?? "Unknown creator",
    avatarUrl: str(r.avatar_url) ?? null,
    followers: parseNum(r.follower_count) ?? null,
    engagementRate: parsePct(r.engagement_rate),
    region,
    rating: parseNum(r.certificate_type) ?? null,
    videoCount: parseNum(r.video_count) ?? null,
    salesForProduct: parseNum(r.sales) ?? null,
    metadata: { raw: r, endpoint: "site/product/influencers", gmv: parseNum(r.gmv) },
  };
}

/** Creators driving a product (product detail → influencers tab). */
export async function fetchProductCreators(sourceProductId: string, limit = 24): Promise<MarketCreator[]> {
  const rows = await getAll(
    `/products/${sourceProductId}/influencers`,
    { sort: "desc", order: "sales" },
    limit
  );
  return rows.map(normalizeCreator);
}

// ─── Videos (content layer w/ Promote) ──────────────────────────────────────

function normalizeVideo(r: ApiRow): MarketProductVideo {
  const influencer =
    typeof r.influencer === "object" && r.influencer && !Array.isArray(r.influencer)
      ? (r.influencer as Record<string, unknown>)
      : null;
  const title = str(r.video_title) ?? "";
  const hashTags = title
    .split(/\s+/)
    .filter((t) => t.startsWith("#"))
    .slice(0, 8) ?? null;
  const creatorHandle = str(influencer?.unique_id) ?? str(r.influencer_name) ?? null;
  return {
    videoId: String(r.video_id ?? ""),
    creatorName: creatorHandle || null,
    creatorId: str(influencer?.influencer_id) ?? (r.influencer_id && String(r.influencer_id) !== "0" ? str(r.influencer_id) : null) ?? null,
    description: title || null,
    coverUrl: str(r.cover_url) ?? null,
    playUrl: str(r.video_url) ?? str(r.share_url) ?? null,
    createTime: str(r.publish_time) ?? null,
    duration: parseNum(r.duration),
    region: regionKey(influencer?.region) ?? null,
    views: parseNum(r.views_count) ?? parseNum(r.play_count),
    views1d: null,
    views7d: null,
    views30d: null,
    diggs: parseNum(r.digg_count),
    diggs1d: null,
    diggs7d: null,
    diggs30d: null,
    comments: parseNum(r.comment_count),
    shares: parseNum(r.share_count),
    favorites: null,
    sales: parseNum(r.sales),
    gmv: parseNum(r.gmv),
    isAd: r.is_promote === true || r.is_promote === 1 || r.is_promote === "1",
    isAi: r.is_ai_video === 1 || r.is_ai_video === "1" ? true : r.is_ai_video === 0 || r.is_ai_video === "0" ? false : null,
    salesFlag: null,
    hashTags: hashTags.length > 0 ? hashTags : null,
    metadata: {
      raw: r,
      endpoint: "site/product/videos",
      engagementRate: parsePct(r.engagement_rate),
      likesPerViews: parsePct(r.likes_per_views),
      awemeType: r.aweme_type ?? null,
    },
  };
}

/**
 * Videos featuring a product — sorted by video sales, each row carries
 * is_promote (the "Promote" badge) + is_ai_video flags natively. No batch
 * enrichment call needed (unlike the API adapter).
 */
export async function fetchProductVideos(sourceProductId: string, limit = 10): Promise<MarketProductVideo[]> {
  const rows = await getAll(
    `/products/${sourceProductId}/videos`,
    { sort: "desc", order: "sales" },
    limit
  );
  return rows.map(normalizeVideo).filter((v) => v.videoId);
}

// ─── Seller / brand products ────────────────────────────────────────────────

/** Every product sold by a seller/brand — "click a brand → all their products". */
export async function fetchSellerProducts(sellerId: string, limit = 24): Promise<MarketProduct[]> {
  const rows = await getAll(
    `/sellers/${sellerId}/products`,
    { region: "US" },
    limit
  );
  return rows.map((r, i) => normalizeLeaderboard(r, i + 1, "day", "US"));
}

// ─── Global search (search/*) ───────────────────────────────────────────────

/**
 * Global search across the site's entity types — mirrors the site's search
 * dropdown (Influencer / Product / Shop / Live / Video / Hash Tag). Verified
 * live: search/products, search/influencers, search/sellers, search/videos.
 * (search/shops and search/hashtags 404 server-side — not used.)
 */

function normalizeInfluencer(r: ApiRow): MarketInfluencer {
  const region = regionKey(r.region);
  return {
    source: "echotik" as MarketSource,
    sourceCreatorId: String(r.influencer_id ?? ""),
    // Leaderboard rows carry nick_name (display) + unique_id (@handle).
    name: str(r.nick_name) ?? str(r.unique_id) ?? str(r.influencer_name) ?? "Unknown creator",
    avatarUrl: str(r.avatar_url) ?? null,
    bio: str(r.bio) ?? null,
    followers: parseNum(r.follower_count) ?? parseNum(r.total_followers_cnt) ?? null,
    likes: parseNum(r.heart_count) ?? parseNum(r.total_digg_cnt) ?? null,
    videoCount: parseNum(r.video_count) ?? parseNum(r.videos_count) ?? parseNum(r.total_post_video_cnt) ?? null,
    liveCount: parseNum(r.live_count) ?? parseNum(r.total_live_cnt) ?? null,
    sales: parseNum(r.sales) ?? parseNum(r.total_sale_cnt) ?? parseNum(r.total_sales_cnt) ?? null,
    gmv: parseNum(r.gmv) ?? parseNum(r.total_gmv_amt) ?? null,
    category: str(r.category) ?? str(r.category_product) ?? null,
    region,
    rating: parseNum(r.certificate_type) ?? parseNum(r.influencer_level) ?? null,
    engagementRate: parsePct(r.engagement_rate),
    metadata: { raw: r, endpoint: "site/search/influencers", engagementRate: parsePct(r.engagement_rate) },
  };
}

/** Search creators/influencers by nickname, TikTok ID, email, or video hashtag. */
export async function searchInfluencers(keyword: string, region = "US", limit = 20): Promise<MarketInfluencer[]> {
  const rows = await getAll(`/search/influencers`, { keyword, region }, limit);
  return rows.map(normalizeInfluencer).filter((c) => c.sourceCreatorId);
}

function normalizeShop(r: ApiRow): MarketShop {
  const region = regionKey(r.region);
  // Search rows zero-out follower/product/video counts (data gap — a shop with
  // 2.73M sales does not have 0 followers). Treat literal "0" as unknown.
  const cnt = (v: unknown): number | null => {
    const n = parseNum(v);
    return n === 0 ? null : n;
  };
  return {
    source: "echotik" as MarketSource,
    sourceSellerId: String(r.seller_id ?? ""),
    name: str(r.seller_name) ?? "Unknown shop",
    coverUrl: str(r.cover_url) ?? null,
    category: str(r.category) ?? null,
    region,
    followers: cnt(r.followers_count),
    productCount: cnt(r.total_product_cnt) ?? cnt(r.product_count) ?? cnt(r.total_product_count),
    videoCount: cnt(r.total_video_cnt) ?? cnt(r.total_video_count),
    liveCount: cnt(r.total_live_cnt) ?? cnt(r.total_live_count),
    sales: parseNum(r.total_sale_cnt) ?? null,
    gmv: parseNum(r.total_gmv_amt) ?? null,
    rating: parseNum(r.seller_rating) ?? null,
    isSShop: r.is_s_shop === "1" || r.is_s_shop === 1 || r.is_s_shop === true,
    metadata: { raw: r, endpoint: "site/search/sellers", salesTrending: str(r.sales_trending) },
  };
}

/** Search shops/sellers by name (search/sellers). */
export async function searchShops(keyword: string, region = "US", limit = 20): Promise<MarketShop[]> {
  const rows = await getAll(`/search/sellers`, { keyword, region }, limit);
  return rows.map(normalizeShop).filter((s) => s.sourceSellerId);
}

/** Search videos by keyword (search/videos) — same normalizeVideo as product videos. */
export async function searchVideos(keyword: string, region = "US", limit = 20): Promise<MarketProductVideo[]> {
  const rows = await getAll(`/search/videos`, { keyword, region }, limit);
  return rows.map(normalizeVideo).filter((v) => v.videoId);
}

/** Every product promoted by a creator/influencer (influencers/{id}/products). */
export async function fetchInfluencerProducts(influencerId: string, limit = 24): Promise<MarketProduct[]> {
  const rows = await getAll(`/influencers/${influencerId}/products`, { region: "US" }, limit);
  return rows.map((r, i) => normalizeLeaderboard(r, i + 1, "day", "US"));
}

// ─── Recency pull ("what are they pushing right now") ───────────────────────

/**
 * Normalize the nested `product` object carried on influencer video rows
 * (verified live 2026-08-29): product_id, product_name, cover_url,
 * min/max/avg_price, commission ("22%"), product_rating, review_count,
 * total_sale_cnt, total_gmv_amt. The video's own sales/gmv ride along in
 * metadata so the UI can show "video drove $X".
 */
function normalizeVideoProduct(
  p: ApiRow,
  rank: number,
  videoSales: number | null,
  videoGmv: number | null,
  promotedAt: string | null
): MarketProduct {
  const price = parseNum(p.min_price) ?? parseNum(p.avg_price);
  const priceMax = parseNum(p.max_price) ?? price;
  return {
    source: "echotik" as MarketSource,
    sourceProductId: String(p.product_id ?? ""),
    name: String(p.product_name ?? "Unknown product"),
    imageUrl: str(p.cover_url) ?? null,
    priceMin: price,
    priceMax: priceMax,
    currency: "USD",
    categoryL1: str(p.category_name) ?? null,
    categoryL2: null,
    categoryL3: null,
    region: "US",
    rank,
    rankPeriod: "day",
    sales7d: null,
    sales30d: parseNum(p.total_sale_cnt) ?? null,
    gmv30d: parseNum(p.total_gmv_amt) ?? null,
    growthRate: null,
    commissionRate: parsePct(p.commission),
    videoCount: null,
    creatorCount: null,
    isHot: false,
    momentumScore: null,
    metadata: {
      raw: p,
      endpoint: "site/influencer/videos",
      reviewCount: parseNum(p.review_count),
      productRating: parseNum(p.product_rating),
      videoSales,
      videoGmv,
      promotedAt,
    },
  };
}

/**
 * Products a creator has promoted in the last `days` days — the "what are
 * they trying to sell lately" extract. The influencer catalog endpoint has no
 * recency filter, but /influencers/{id}/videos is publish-date-desc and each
 * row carries the nested product → walk pages newest-first until we pass the
 * cutoff, dedupe by product_id (first occurrence = most recent video).
 */
export async function fetchRecentInfluencerProducts(
  influencerId: string,
  days = 14,
  limit = 100
): Promise<MarketProduct[]> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const out: MarketProduct[] = [];
  const seen = new Set<string>();
  let page = 1;
  const per = 50;
  while (page <= 10 && out.length < limit) {
    const { rows } = await get(`/influencers/${influencerId}/videos`, { page, per_page: per });
    if (rows.length === 0) break;
    let pastCutoff = false;
    for (const r of rows) {
      const pubDay = str(r.publish_time)?.slice(0, 10) ?? "";
      if (pubDay && pubDay < cutoff) {
        pastCutoff = true;
        break;
      }
      const p = typeof r.product === "object" && r.product ? (r.product as ApiRow) : null;
      if (!p) continue;
      const pid = String(p.product_id ?? "");
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      out.push(normalizeVideoProduct(p, out.length + 1, parseNum(r.sales), parseNum(r.gmv), pubDay || null));
      if (out.length >= limit) break;
    }
    if (pastCutoff || rows.length < per) break;
    page += 1;
  }
  return out;
}

// ─── Cover resolution ───────────────────────────────────────────────────────

/**
 * Site cover_url values are already public CDN URLs (cdn.echotik.live) — no
 * signed-download exchange needed. Pass-through for the image proxy routes.
 */
export async function resolveCoverUrl(coverField: string): Promise<string> {
  if (/^https:\/\//.test(coverField)) return coverField;
  // Fall back to the legacy JSON-encoded shape if it ever appears.
  try {
    const parsed = JSON.parse(coverField);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of list) {
      if (item && typeof item.url === "string" && item.url.startsWith("https://")) return item.url;
    }
  } catch {
    // not JSON
  }
  throw new Error("[echotik-site] invalid cover url");
}

// ─── Creator leaderboards ("find the creators moving volume") ──────────────
// Verified live 2026-09-01: /influencers/leaderboard/champion-sales is the
// "Sales Champion" tab on echotik.live — ranked creators/sellers by sales.
// Auth = full session cookie (leaderboardHeaders); region = x-region header,
// NOT a query param. Success envelope is code=100004 WITH data. Params:
//   time_type=daily|weekly|monthly, time_range=<id from filters>
//   page, per_page, influencer_role=1|2|"" (Creator|Seller|All),
//   influencer_categories, product_categories (ids from filters)
// Other boards on the same shape: followers, followers-increment,
// darkhorse-creator, darkhorse-seller, hot-live, most-views-live.

export type CreatorBoard =
  | "champion-sales"
  | "followers"
  | "followers-increment"
  | "darkhorse-creator"
  | "darkhorse-seller"
  | "hot-live"
  | "most-views-live";

export type CreatorRole = "creator" | "seller" | "all";

export interface TopCreatorsQuery {
  /** Daily / weekly / monthly leaderboard period (default day). */
  period?: "day" | "week" | "month";
  /** creator=1, seller=2, all="" (default all). */
  role?: CreatorRole;
  /** Board to read (default champion-sales). */
  board?: CreatorBoard;
  /** Max rows (per_page cap 50 — 1 request; >50 pages, cached per page). */
  limit?: number;
  /** Influencer category filter id (from getLeaderboardFilters). */
  categoryId?: string;
}

export interface LeaderboardFilters {
  timeType: "daily" | "weekly" | "monthly";
  /** Available time_range ids per period; first entry = most recent. */
  timeRanges: Record<"daily" | "weekly" | "monthly", string[]>;
  influencerRoles: { id: string; name: string }[];
  influencerCategories: { id: string; name: string }[];
  productCategories: { id: string; name: string }[];
}

/** Fetch the leaderboard filter options (time ranges, roles, categories). */
export async function getLeaderboardFilters(): Promise<LeaderboardFilters> {
  const path = "/influencers/leaderboard/filters";
  const key = cacheKey("echotik-site", path);
  const cached = await cacheGet<LeaderboardFilters>(key);
  if (cached) return cached;
  const res = await fetch(`${BASE}${path}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!text.trim().startsWith("{")) {
    throw new Error(`[echotik-site] ${path}: non-JSON response (${res.status})`);
  }
  const json = JSON.parse(text) as { data?: Record<string, unknown> };
  const data = json.data ?? {};
  const idName = (list: unknown): { id: string; name: string }[] =>
    Array.isArray(list)
      ? (list as ApiRow[]).map((r) => ({ id: String(r.id ?? ""), name: String(r.name ?? "") }))
      : [];
  const tt = (data.time_type as ApiRow[] | undefined) ?? [];
  const ranges = {} as LeaderboardFilters["timeRanges"];
  for (const t of ["daily", "weekly", "monthly"] as const) {
    const list = (data.time_range as Record<string, ApiRow[]> | undefined)?.[t] ?? [];
    ranges[t] = list.map((r) => String(r.id ?? "")).filter(Boolean);
  }
  const filters: LeaderboardFilters = {
    timeType: (tt.find((r) => r.id === "daily") ? "daily" : String(tt[0]?.id ?? "daily")) as LeaderboardFilters["timeType"],
    timeRanges: ranges,
    influencerRoles: idName(data.influencer_role),
    influencerCategories: idName(data.influencer_categories),
    productCategories: idName(data.product_categories),
  };
  await cacheSet(key, filters, 4 * 3600);
  return filters;
}

/**
 * Top creators by sales (champion-sales) — the "find who's moving volume"
 * feed. 1 request per (period, role, board) combo, cached 4h.
 */
export async function fetchTopCreators(query: TopCreatorsQuery = {}): Promise<MarketInfluencer[]> {
  const { period = "day", role = "all", board = "champion-sales", limit = 50, categoryId } = query;
  const timeType = period === "day" ? "daily" : period === "week" ? "weekly" : "monthly";
  const filters = await getLeaderboardFilters();
  const timeRange = filters.timeRanges[timeType]?.[0] ?? "";
  if (!timeRange) throw new Error(`[echotik-site] no ${timeType} time range available from leaderboard filters`);
  const roleId = role === "creator" ? "1" : role === "seller" ? "2" : "";

  const path = `/influencers/leaderboard/${board}`;
  const per = Math.min(Math.max(limit, 10), 50);
  const params: Record<string, string> = {
    time_type: timeType,
    time_range: timeRange,
    page: "1",
    per_page: String(per),
    influencer_role: roleId,
    influencer_categories: categoryId ?? "",
    product_categories: "",
  };
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== "" && v != null)
  ).toString();

  const key = cacheKey("echotik-site", `${path}?${qs}`);
  const cached = await cacheGet<ApiRow[]>(key);
  let rows: ApiRow[];
  if (cached) {
    rows = cached;
  } else {
    const res = await fetch(`${BASE}${path}?${qs}`, {
      headers: leaderboardHeaders(),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!text.trim().startsWith("{")) {
      throw new Error(
        `[echotik-site] ${path}: non-JSON (${res.status}) — ECHOTIK_WEB_COOKIE expired? re-export from browser`
      );
    }
    const json = JSON.parse(text) as { code?: number; msg?: string; data?: unknown };
    if (!Array.isArray(json.data)) {
      throw new Error(`[echotik-site] ${path}: code=${json.code} msg=${json.msg ?? "unknown"}`);
    }
    rows = json.data;
    if (rows.length > 0) await cacheSet(key, rows, 4 * 3600);
  }

  return rows.map((r, i) => {
    const creator = normalizeInfluencer(r);
    return {
      ...creator,
      metadata: { ...(creator.metadata ?? {}), rank: i + 1, endpoint: `site${path}` },
    };
  });
}
