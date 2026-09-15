import { fetchWinningProducts } from "./fastmoss";
import { fetchProductOverview, fetchProductDetail, fetchCreatorProducts } from "./fastmoss";
import { cacheGet, cacheSet, cacheKey } from "./cache";
/* FastMoss returns dynamically-shaped JSON payloads. */
/* eslint-disable @typescript-eslint/no-explicit-any */

const money = (n: number | null | undefined) => n == null ? "—" : `$${Math.round(n).toLocaleString()}`;
const DIGEST_STRATEGY_VERSION = "seller-led-v2";

function digestWeekKey() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const start = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((thursday.getTime() - start.getTime()) / 86400000) + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Build a compact, credit-conscious weekly product-research digest. */
export async function buildFastMossWeeklyDigest() {
  const key = cacheKey("fastmoss-digest", `${DIGEST_STRATEGY_VERSION}:US:${digestWeekKey()}`);
  const cached = await cacheGet<{ text: string; products: Array<{ id: string; name: string }> }>(key);
  if (cached) return cached;
  const ranked = await fetchWinningProducts({ period: "week", region: "US", limit: 50, sortField: "gmv", sortType: "desc" });
  const seedCreatorUid = "7032058347824563246";
  const sellerProducts = await fetchCreatorProducts(seedCreatorUid, 28, 10);
  const excluded = /trading card|collectible|mystery|virtual|digital|graphic print sports tee/i;
  const sellerPool = sellerProducts.filter((p) => (p.priceMin ?? 0) >= 15 && (p.priceMax ?? 999) <= 150 && !excluded.test(p.name)).slice(0, 3);
  const candidates = ranked
    .filter((p) => (p.priceMin ?? 0) >= 60 && (p.growthRate ?? 0) > 50)
    .slice(0, 5);
  const candidateIds = new Set([...candidates, ...sellerPool].map((p) => p.sourceProductId));
  // Always fill a useful shortlist. Strict matches come first, followed by
  // the next highest-GMV products, without spending calls on the whole board.
  const pool = [
    ...sellerPool,
    ...candidates.filter((p) => !sellerPool.some((s) => s.sourceProductId === p.sourceProductId)),
    ...ranked.filter((p) => !candidateIds.has(p.sourceProductId)).slice(0, Math.max(0, 5 - sellerPool.length - candidates.length)),
  ].slice(0, 5);
  const details = [] as Array<{ product: typeof ranked[number]; overview: any; detail: any }>;
  for (const product of pool) {
    const enriched = await fetchProductOverview(product.sourceProductId, 7);
    const detail = await fetchProductDetail(product.sourceProductId);
    details.push({ product, overview: enriched.data, detail: detail.data });
  }
  const lines = ["FastMoss weekly TikTok Shop digest", "Last completed week • US", ""];
  const products: Array<{ id: string; name: string }> = [];
  if (!candidates.length) lines.push("No products met both $60+ price and >50% growth in the top 50. Showing closest high-demand opportunities:", "");
  else if (candidates.length < 5) lines.push(`${candidates.length} product${candidates.length === 1 ? "" : "s"} met the strict filter. Showing additional seller-led and high-demand opportunities below:`, "");
  for (const [index, item] of details.entries()) {
    const summary = item.overview?.period_summary ?? {};
    const productDetail = item.detail?.product ?? {};
    const affiliate = item.overview?.channel_distribution?.breakdown?.find((x: any) => x.sales_channel === "affiliate");
    const video = item.overview?.content_distribution?.breakdown?.find((x: any) => x.content_type === "video");
    const ads = item.overview?.ads_distribution?.breakdown?.find((x: any) => x.traffic_source === "ad_traffic");
    const creators = summary.linked_creator_count;
    // Practical launch filter: under 600 creators still leaves room to
    // compete, while avoiding the unrealistic under-50 ceiling for proven
    // winners. Require meaningful affiliate + video contribution too.
    const strict = (item.product.priceMin ?? 0) >= 60 &&
      (item.product.growthRate ?? 0) > 50 &&
      (creators ?? Infinity) < 600 &&
      (affiliate?.gmv_share_percent ?? 0) >= 20 &&
      (video?.gmv_share_percent ?? 0) >= 20;
    lines.push(`${index + 1}. ${strict ? "✅ " : "• "}${item.product.name}`);
    products.push({ id: item.product.sourceProductId, name: item.product.name });
    lines.push(`   ${money(summary.period_total_gmv ?? item.product.gmv30d)} GMV • ${(item.product.growthRate ?? 0).toFixed(1)}% growth • ${item.product.priceMin ?? "—"}-${item.product.priceMax ?? "—"} price`);
    lines.push(`   ${creators ?? "—"} creators • ${summary.period_total_units_sold ?? "—"} units • affiliate ${affiliate?.gmv_share_percent ?? 0}% • video ${video?.gmv_share_percent ?? 0}% • ads ${ads?.gmv_share_percent ?? 0}%`);
    lines.push(`   Product ID: ${item.product.sourceProductId}`);
    lines.push(`   TikTok Shop: ${productDetail.detail_url ?? "unavailable"}`);
    lines.push(`   FastMoss: https://www.fastmoss.com/e-commerce/detail/${item.product.sourceProductId}`, "");
  }
  lines.push("Strategy: shortlist first, then validate commission, listing quality, shipping, and creative angles before posting.");
  const result = { text: lines.join("\n"), products };
  // Eight days spans the full weekly period and protects against duplicate
  // Telegram commands while allowing the next completed week to refresh.
  await cacheSet(key, result, 8 * 24 * 3600);
  return result;
}
