/**
 * EchoTik adapter — the primary winning-product source.
 * Docs: https://opendocs.echotik.live  (openapi yaml per endpoint)
 * Auth: Basic (dedicated username/password from the EchoTik API dashboard).
 *
 * Endpoints used (EchoTik's documented v3 API):
 *   GET /api/v3/echotik/product/ranklist            — period rankings
 *   GET /api/v3/echotik/product/list                — product search
 *   GET /api/v3/echotik/product/influencer/list     — creators driving a product
 *
 * EchoTik documents Basic Auth for these API endpoints. Keep credentials
 * server-side in ECHOTIK_USERNAME / ECHOTIK_PASSWORD.
 */
import type { MarketCreator, MarketProduct, MarketQuery, MarketSource } from "./types";
import { MissingSourceCredentialsError } from "./types";

const BASE = "https://open.echotik.live/api/v3/echotik";
const MAX_PAGE_SIZE = 10;

function pageSize(limit: number | undefined): string {
  return String(Math.min(Math.max(limit ?? MAX_PAGE_SIZE, 1), MAX_PAGE_SIZE));
}

function authHeader(): string {
  const u = process.env.ECHOTIK_USERNAME;
  const p = process.env.ECHOTIK_PASSWORD;
  if (!u || !p) throw new MissingSourceCredentialsError("echotik", ["ECHOTIK_USERNAME", "ECHOTIK_PASSWORD"]);
  return "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
}

async function get(path: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[echotik] ${res.status} ${path}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (typeof json?.code === "number" && json.code !== 0) {
    throw new Error(`[echotik] API ${json.code} ${path}: ${String(json.message ?? json.msg ?? "request failed").slice(0, 200)}`);
  }
  // EchoTik wraps data under data / data.list / data.products depending on endpoint.
  return json?.data ?? json;
}

/** Exchange EchoTik's private stored cover URL for a public URL valid for 24h. */
export async function resolveCoverUrl(coverUrl: string): Promise<string> {
  const source = new URL(coverUrl);
  if (source.protocol !== "https:" || source.hostname !== "echosell-images.tos-ap-southeast-1.volces.com") {
    return coverUrl;
  }

  const data = await get("/batch/cover/download", { cover_urls: coverUrl });
  const resolved = data && typeof data === "object"
    ? (data as Record<string, unknown>)[coverUrl] ?? Object.values(data as Record<string, unknown>)[0]
    : null;
  if (typeof resolved !== "string") throw new Error("[echotik] cover download returned no URL");

  const destination = new URL(resolved);
  if (destination.protocol !== "https:") throw new Error("[echotik] cover download returned an invalid URL");
  return destination.toString();
}

/** Ranklist → "who climbed fastest" per period. THE winning-product feed. */
export async function fetchWinningProducts(query: MarketQuery): Promise<MarketProduct[]> {
  // TODO_VERIFY: parameter names for ranklist (product_rank_field=1 hot-sales,
  // 2 creator-promoted), region codes, category params.
  const rankType = query.period === "day" ? 1 : query.period === "week" ? 2 : 3;
  const date = new Date().toISOString().slice(0, 10);
  try {
    const data = await get("/product/ranklist", {
      date,
      region: query.region ?? "US",
      rank_type: String(rankType),
      product_rank_field: "1", // total_sale_cnt
      page_num: "1",
      ...(query.category ? { product_category_id: query.category } : {}),
      page_size: pageSize(query.limit),
    });

    const rows = responseRows(data);
    if (rows.length > 0) return rows.map((r, i) => normalize(r, i + 1, query.period));
  } catch {
    // Ranking snapshots can be briefly unavailable while the daily feed rolls
    // over. The product list below is still a valid, useful research feed.
  }

  // EchoTik can publish product rankings after the daily snapshot closes.
  // Keep the Market tab useful during that window by falling back to the
  // documented product list, which is available in the trial account.
  return searchProducts(query);
}

/** Deep product search: 30-day GMV, commission, creator/video counts. */
export async function searchProducts(query: MarketQuery): Promise<MarketProduct[]> {
  const data = await get("/product/list", {
    region: query.region ?? "US",
    ...(query.category ? { category_id: query.category } : {}),
    product_sort_field: "2", // total_sale_gmv_amt
    sort_type: "1", // descending
    page_num: "1",
    page_size: pageSize(query.limit),
  });
  const rows = responseRows(data);
  return rows.map((r, i) => normalize(r, i + 1, query.period));
}

function normalize(r: Record<string, any>, fallbackRank: number, period: MarketQuery["period"]): MarketProduct {
  // Field-name aliases across EchoTik endpoint versions.
  const pick = (...keys: string[]) => {
    for (const k of keys) if (r[k] !== undefined && r[k] !== null) return r[k];
    return null;
  };
  const price = pick("price", "sale_price", "min_price", "price_min");
  const priceMax = pick("price_max", "max_price", "origin_price");
  return {
    source: "echotik" as MarketSource,
    sourceProductId: String(pick("product_id", "id") ?? fallbackRank),
    name: String(pick("product_name", "title", "name") ?? "Unknown product"),
    imageUrl: normalizeImageUrl(pick("cover_url", "product_image", "image_url", "cover", "main_image")),
    priceMin: price !== null ? Number(price) : numOrNull(pick("spu_avg_price")),
    priceMax: priceMax !== null ? Number(priceMax) : price !== null ? Number(price) : numOrNull(pick("spu_avg_price")),
    currency: pick("currency", "currency_code") ?? "USD",
    categoryL1: pick("category_name", "category_l1_name", "category_name_l1", "l1_category") ?? null,
    categoryL2: pick("category_l2_name", "category_name_l2", "l2_category") ?? null,
    categoryL3: pick("category_l3_name", "category_name_l3", "l3_category") ?? null,
    region: pick("region", "country_code") ?? "US",
    rank: pick("rank", "rank_no") ?? fallbackRank,
    rankPeriod: period,
    sales7d: intOrNull(pick("total_sale_7d_cnt", "sales_7d", "sales_increment", "seven_day_sales")),
    sales30d: intOrNull(pick("total_sale_cnt", "sales_30d", "total_sales", "thirty_day_sales")),
    gmv30d: numOrNull(pick("total_sale_gmv_amt", "gmv_30d", "gmv", "total_gmv", "gmv_increment")),
    growthRate: numOrNull(pick("growth_rate", "sales_growth", "increase_rate")),
    commissionRate: numOrNull(pick("commission_rate", "commission")),
    videoCount: intOrNull(pick("total_video_cnt", "video_count", "video_num", "sales_video_count")),
    creatorCount: intOrNull(pick("total_ifl_cnt", "creator_count", "creator_num", "affiliate_count")),
    isHot: Boolean(pick("is_hot", "hot_flag", "is_boom")),
    momentumScore: null,
    metadata: { raw: r },
  };
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function responseRows(data: unknown): Record<string, any>[] {
  if (Array.isArray(data)) return data as Record<string, any>[];
  if (!data || typeof data !== "object") return [];
  const value = data as Record<string, unknown>;
  const rows = value.list ?? value.products ?? value.influencers ?? value.items ?? value.data;
  return Array.isArray(rows) ? rows as Record<string, any>[] : [];
}

function normalizeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.trim().startsWith("[")) return value;
  try {
    const parsed = JSON.parse(value) as Array<{ url?: unknown }>;
    return typeof parsed[0]?.url === "string" ? parsed[0].url : null;
  } catch {
    return null;
  }
}

/**
 * Creators driving a specific product (affiliate layer).
 * GET /api/v2/product/influencer/list?product_id=...
 * Returns the creator pool for a product: identity, followers, engagement,
 * and per-product sales/video contribution.
 */
export async function fetchProductCreators(
  sourceProductId: string,
  limit = 20
): Promise<MarketCreator[]> {
  // TODO_VERIFY: response/param field names for influencer list.
  const data = await get("/product/influencer/list", {
    product_id: sourceProductId,
    page_num: "1",
    page_size: pageSize(limit),
  });

  const rows = responseRows(data);
  return rows.map((r) => ({
    source: "echotik" as MarketSource,
    sourceCreatorId: String(r?.user_id ?? r?.unique_id ?? r?.id ?? ""),
    name: String(r?.nickname ?? r?.unique_id ?? r?.name ?? "Unknown"),
    avatarUrl: r?.avatar ?? r?.avatar_url ?? null,
    followers: numOrNull(r?.follower_count ?? r?.followers ?? r?.follower_cnt),
    engagementRate: numOrNull(r?.engagement_rate ?? r?.interaction_rate),
    region: r?.region ?? null,
    rating: numOrNull(r?.rating ?? r?.score),
    videoCount: numOrNull(r?.video_count ?? r?.product_video_count),
    salesForProduct: numOrNull(r?.sales ?? r?.product_sales),
    metadata: { raw: r },
  }));
}
