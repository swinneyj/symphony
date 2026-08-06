/**
 * FastMoss OpenAPI adapter — secondary winning-product source.
 * Console: https://developers.fastmoss.com (client_id + client_secret → token).
 * Data: product sales trends, hot rankings, category analysis; creators,
 * shops, videos, live. Endpoint paths locked at first live test (TODO_VERIFY).
 */
import type { MarketProduct, MarketQuery, MarketSource } from "./types";
import { MissingSourceCredentialsError } from "./types";

const BASE = "https://api.fastmoss.com";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const id = process.env.FASTMOSS_CLIENT_ID;
  const secret = process.env.FASTMOSS_CLIENT_SECRET;
  if (!id || !secret) {
    throw new MissingSourceCredentialsError("fastmoss", ["FASTMOSS_CLIENT_ID", "FASTMOSS_CLIENT_SECRET"]);
  }
  // TODO_VERIFY: exact auth endpoint + grant shape.
  const res = await fetch(`${BASE}/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: id, client_secret: secret, grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`[fastmoss] token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  cachedToken = {
    token: json.access_token ?? json.token ?? json.data?.access_token,
    expiresAt: Date.now() + ((json.expires_in ?? 3600) as number) * 1000,
  };
  if (!cachedToken.token) throw new Error("[fastmoss] no access_token in token response");
  return cachedToken.token;
}

/** Hot product ranking. TODO_VERIFY: exact endpoint + params. */
export async function fetchWinningProducts(query: MarketQuery): Promise<MarketProduct[]> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/v1/product/ranking`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`[fastmoss] ranking ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const rows: any[] = json?.data?.list ?? json?.data ?? json?.list ?? [];
  return rows.map((r, i) => ({
    source: "fastmoss" as MarketSource,
    sourceProductId: String(r.product_id ?? r.id ?? i + 1),
    name: String(r.product_title ?? r.product_name ?? r.title ?? "Unknown product"),
    imageUrl: r.product_image ?? r.image ?? r.main_image ?? null,
    priceMin: numOrNull(r.min_price ?? r.price ?? r.lowest_price),
    priceMax: numOrNull(r.max_price ?? r.highest_price ?? r.price),
    currency: r.currency ?? "USD",
    categoryL1: r.category_name ?? r.category ?? null,
    categoryL2: null,
    categoryL3: null,
    region: query.region ?? "US",
    rank: r.rank ?? i + 1,
    rankPeriod: query.period,
    sales7d: intOrNull(r.sales_7d ?? r.sales_increment ?? r.sales),
    sales30d: intOrNull(r.sales_30d ?? r.total_sales),
    gmv30d: numOrNull(r.gmv ?? r.total_gmv ?? r.gmv_30d),
    growthRate: numOrNull(r.growth_rate ?? r.sales_growth),
    commissionRate: numOrNull(r.commission_rate ?? r.commission),
    videoCount: intOrNull(r.video_count ?? r.related_video_count),
    creatorCount: intOrNull(r.creator_count ?? r.affiliate_count),
    isHot: Boolean(r.is_hot ?? r.hot_flag),
    metadata: { raw: r },
  }));
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
