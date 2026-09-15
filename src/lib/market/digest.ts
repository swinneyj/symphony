import { fetchWinningProducts } from "./fastmoss";
import { fetchProductOverview } from "./fastmoss";
/* FastMoss returns dynamically-shaped JSON payloads. */
/* eslint-disable @typescript-eslint/no-explicit-any */

const money = (n: number | null | undefined) => n == null ? "—" : `$${Math.round(n).toLocaleString()}`;

/** Build a compact, credit-conscious weekly product-research digest. */
export async function buildFastMossWeeklyDigest() {
  const ranked = await fetchWinningProducts({ period: "week", region: "US", limit: 50, sortField: "gmv", sortType: "desc" });
  const candidates = ranked
    .filter((p) => (p.priceMin ?? 0) >= 60 && (p.growthRate ?? 0) > 50)
    .slice(0, 5);
  const pool = candidates.length ? candidates : ranked.slice(0, 5);
  const details = [] as Array<{ product: typeof ranked[number]; overview: any }>;
  for (const product of pool) {
    const enriched = await fetchProductOverview(product.sourceProductId, 7);
    details.push({ product, overview: enriched.data });
  }
  const lines = ["FastMoss weekly TikTok Shop digest", "Last completed week • US", ""];
  if (!candidates.length) lines.push("No products met both $60+ price and >50% growth in the top 50. Showing closest high-demand opportunities:", "");
  for (const [index, item] of details.entries()) {
    const summary = item.overview?.period_summary ?? {};
    const affiliate = item.overview?.channel_distribution?.breakdown?.find((x: any) => x.sales_channel === "affiliate");
    const video = item.overview?.content_distribution?.breakdown?.find((x: any) => x.content_type === "video");
    const ads = item.overview?.ads_distribution?.breakdown?.find((x: any) => x.traffic_source === "ad_traffic");
    const creators = summary.linked_creator_count;
    const strict = (item.product.priceMin ?? 0) >= 60 && (item.product.growthRate ?? 0) > 50 && (creators ?? Infinity) < 50;
    lines.push(`${index + 1}. ${strict ? "✅ " : "• "}${item.product.name}`);
    lines.push(`   ${money(summary.period_total_gmv ?? item.product.gmv30d)} GMV • ${(item.product.growthRate ?? 0).toFixed(1)}% growth • ${item.product.priceMin ?? "—"}-${item.product.priceMax ?? "—"} price`);
    lines.push(`   ${creators ?? "—"} creators • ${summary.period_total_units_sold ?? "—"} units • affiliate ${affiliate?.gmv_share_percent ?? 0}% • video ${video?.gmv_share_percent ?? 0}% • ads ${ads?.gmv_share_percent ?? 0}%`);
    lines.push(`   Product ID: ${item.product.sourceProductId}`, "");
  }
  lines.push("Strategy: shortlist first, then validate commission, listing quality, shipping, and creative angles before posting.");
  return lines.join("\n");
}
