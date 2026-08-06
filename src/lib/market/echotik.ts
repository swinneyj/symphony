/**
 * EchoTik adapter — the primary winning-product source.
 * Docs: https://opendocs.echotik.live  (openapi yaml per endpoint)
 * Auth: Basic (dedicated username/password from the EchoTik API dashboard).
 *
 * Endpoints used:
 *   GET /api/v3/echotik/product/ranklist            — period rankings w/ sales+GMV deltas
 *   GET /api/v3/echotik/product/list                — deep product search (T+1)
 *   GET /api/v3/echotik/product/influencer/list     — creators driving a product (affiliate layer)
 *
 * NOTE: response field names are mapped defensively; exact key names get
 * locked during the first live test (TODO_VERIFY).
 */
import type { MarketCreator, MarketProduct, MarketQuery, MarketSource } from "./types";
import { MissingSourceCredentialsError } from "./types";

const BASE = "https://open.echotik.live";

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
  // EchoTik wraps data under data / data.list / data.products depending on endpoint.
  return json?.data ?? json;
}

/** Ranklist → "who climbed fastest" per period. THE winning-product feed. */
export async function fetchWinningProducts(query: MarketQuery): Promise<MarketProduct[]> {
  // TODO_VERIFY: parameter names for ranklist (product_rank_field=1 hot-sales,
  // 2 creator-promoted), region codes, category params.
  const periodDays = query.period === "day" ? 0 : query.period === "week" ? 6 : 29;
  const date = new Date(Date.now() - periodDays * 86_400_000).toISOString().slice(0, 10);
  const data = await get("/api/v3/echotik/product/ranklist", {
    date,
    region: query.region ?? "US",
    product_rank_field: "1",
    ...(query.category ? { category_id: query.category } : {}),
    page_size: String(query.limit ?? 50),
  });

  const rows: any[] = data?.list ?? data?.products ?? data?.items ?? [];
  return rows.map((r, i) => normalize(r, i + 1));
}

/** Deep product search: 30-day GMV, commission, creator/video counts. */
export async function searchProducts(query: MarketQuery): Promise<MarketProduct[]> {
  const data = await get("/api/v3/echotik/product/list", {
    region: query.region ?? "US",
    ...(query.category ? { category_id: query.category } : {}),
    product_sort_field: "gmv", // TODO_VERIFY sort field enum
    sort_type: "desc",
    page_size: String(query.limit ?? 50),
  });
  const rows: any[] = data?.list ?? data?.products ?? data?.items ?? [];
  return rows.map((r, i) => normalize(r, i + 1));
}

function normalize(r: Record<string, any>, fallbackRank: number): MarketProduct {
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
    imageUrl: pick("product_image", "image_url", "cover", "main_image") ?? null,
    priceMin: price !== null ? Number(price) : null,
    priceMax: priceMax !== null ? Number(priceMax) : price !== null ? Number(price) : null,
    currency: pick("currency", "currency_code") ?? "USD",
    categoryL1: pick("category_l1_name", "category_name_l1", "l1_category") ?? null,
    categoryL2: pick("category_l2_name", "category_name_l2", "l2_category") ?? null,
    categoryL3: pick("category_l3_name", "category_name_l3", "l3_category") ?? null,
    region: pick("region", "country_code") ?? "US",
    rank: pick("rank", "rank_no") ?? fallbackRank,
    rankPeriod: "day", // TODO_VERIFY: ranklist period param response
    sales7d: intOrNull(pick("sales_7d", "sales_increment", "seven_day_sales")),
    sales30d: intOrNull(pick("sales_30d", "total_sales", "thirty_day_sales")),
    gmv30d: numOrNull(pick("gmv_30d", "gmv", "total_gmv", "gmv_increment")),
    growthRate: numOrNull(pick("growth_rate", "sales_growth", "increase_rate")),
    commissionRate: numOrNull(pick("commission_rate", "commission")),
    videoCount: intOrNull(pick("video_count", "video_num", "sales_video_count")),
    creatorCount: intOrNull(pick("creator_count", "creator_num", "affiliate_count")),
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

/**
 * Creators driving a specific product (affiliate layer).
 * GET /api/v3/echotik/product/influencer/list?product_id=...
 * Returns the creator pool for a product: identity, followers, engagement,
 * and per-product sales/video contribution.
 */
export async function fetchProductCreators(
  sourceProductId: string,
  limit = 20
): Promise<MarketCreator[]> {
  // TODO_VERIFY: response/param field names for influencer list.
  const data = await get("/api/v3/echotik/product/influencer/list", {
    product_id: sourceProductId,
    page_size: String(limit),
  });

  const rows: any[] = data?.list ?? data?.influencers ?? data?.items ?? [];
  return rows.map((r) => ({
    source: "echotik" as MarketSource,
    sourceCreatorId: String(r?.user_id ?? r?.unique_id ?? r?.id ?? ""),
    name: String(r?.nickname ?? r?.unique_id ?? r?.name ?? "Unknown"),
    avatarUrl: r?.avatar ?? r?.avatar_url ?? null,
    followers: numOrNull(r?.follower_count ?? r?.followers),
    engagementRate: numOrNull(r?.engagement_rate ?? r?.interaction_rate),
    region: r?.region ?? null,
    rating: numOrNull(r?.rating ?? r?.score),
    videoCount: numOrNull(r?.video_count ?? r?.product_video_count),
    salesForProduct: numOrNull(r?.sales ?? r?.product_sales),
    metadata: { raw: r },
  }));
}
