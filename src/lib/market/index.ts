/**
 * Market research registry: winning-product feeds from research sources,
 * normalized to MarketProduct. EchoTik is primary (richest documented API),
 * FastMoss secondary. KaloData's *functionality* (period rankings + growth
 * deltas + creator/video activity) is what we replicate — not their API.
 *
 * Dry-run (MARKET_DRY_RUN=1): returns realistic sample rows WITHOUT storing
 * them — the DB only ever sees real source data.
 */
import type { MarketCreator, MarketInfluencer, MarketProduct, MarketProductVideo, MarketQuery, MarketSearchType, MarketShop, MarketSource, ProductAnalytics } from "./types";
import { dryRunEnabled } from "./types";
import * as echotik from "./echotik";
import * as echotikSite from "./echotik-site";
import * as fastmoss from "./fastmoss";
import { db } from "@/db";
import { marketProducts, marketCreators, marketProductCreators } from "@/db/schema";
import { eq, and, inArray, lt, desc } from "drizzle-orm";

const ADAPTERS: Record<MarketSource, (q: MarketQuery) => Promise<MarketProduct[]>> = {
  echotik: (q) => echotikImpl().fetchWinningProducts(q),
  fastmoss: fastmoss.fetchWinningProducts,
};

/**
 * Pick the EchoTik implementation: the website-session adapter (ECHOTIK_WEB_TOKEN,
 * the $9.9/mo website plan) is PRIMARY; the paid API platform adapter
 * (ECHOTIK_USERNAME/PASSWORD, $139/mo) is the fallback when no web token is set.
 */
function echotikImpl(): typeof echotik | typeof echotikSite {
  return process.env.ECHOTIK_WEB_TOKEN ? echotikSite : echotik;
}

/** True when any Product Library filter is set (routes to search, not ranklist). */
function hasLibraryFilters(q: MarketQuery): boolean {
  return (
    q.priceMin != null || q.priceMax != null ||
    q.commissionMin != null || q.commissionMax != null ||
    q.influencersMin != null || q.influencersMax != null ||
    q.videosMin != null || q.videosMax != null ||
    q.viewsMin != null || q.viewsMax != null ||
    q.ratingMin != null || q.ratingMax != null ||
    q.reviewsMin != null || q.reviewsMax != null ||
    q.salesMin != null || q.salesMax != null ||
    q.sales30dMin != null || q.sales30dMax != null ||
    q.gmvMin != null || q.gmvMax != null ||
    q.gmv30dMin != null || q.gmv30dMax != null ||
    q.salesTrend != null || q.isSShop != null || q.freeShipping != null ||
    q.brandStore != null || q.fromFlag != null || q.isHot != null ||
    q.onSaleOnly || q.salesFlag != null || q.newProductsDays != null ||
    q.categoryL2 != null || q.categoryL3 != null ||
    q.keyword != null ||
    (q.sortField != null && q.sortField !== "sales30d")
  );
}

export async function fetchWinningProducts(
  source: MarketSource,
  query: MarketQuery
): Promise<{ rows: MarketProduct[]; dryRun: boolean }> {
  if (dryRunEnabled()) {
    return { rows: sampleProducts(query.period), dryRun: true };
  }
  // Filtered queries use the Products Library search surface (product/list);
  // unfiltered uses the period rankings (ranklist) — the winners feed.
  if (source === "echotik" && hasLibraryFilters(query)) {
    return { rows: await echotikImpl().searchProducts(query), dryRun: false };
  }
  const adapter = ADAPTERS[source];
  if (!adapter) throw new Error(`[market] unknown source: ${source}`);
  const rows = await adapter(query);
  return { rows, dryRun: false };
}

/**
 * Persists fetched rows as today's snapshot (upsert by source+product+date)
 * and computes momentum_score = rank improvement vs the most recent prior
 * snapshot, blended with growth rate: (prev_rank - cur_rank) + growth*100.
 * Positive = climbing. Returns rows persisted.
 */
export async function ingestMarketRows(
  workspaceId: string,
  source: MarketSource,
  rows: MarketProduct[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ids = rows.map((r) => r.sourceProductId);

  const prior = await db
    .select({
      sourceProductId: marketProducts.sourceProductId,
      rank: marketProducts.rank,
      snapshotDate: marketProducts.snapshotDate,
    })
    .from(marketProducts)
    .where(
      and(
        eq(marketProducts.source, source),
        eq(marketProducts.workspaceId, workspaceId),
        inArray(marketProducts.sourceProductId, ids),
        lt(marketProducts.snapshotDate, today)
      )
    )
    .orderBy(desc(marketProducts.snapshotDate));

  const best = new Map<string, number>();
  for (const p of prior) {
    if (!best.has(p.sourceProductId)) best.set(p.sourceProductId, p.rank ?? 0);
  }

  for (const row of rows) {
    const curRank = row.rank ?? 0;
    const prevRank = best.get(row.sourceProductId);
    const momentum = Number(
      (((prevRank ?? curRank) - curRank) + (row.growthRate ?? 0) * 100).toFixed(2)
    );
    const values = {
      name: row.name,
      imageUrl: row.imageUrl,
      priceMin: row.priceMin != null ? String(row.priceMin) : null,
      priceMax: row.priceMax != null ? String(row.priceMax) : null,
      currency: row.currency,
      categoryL1: row.categoryL1,
      categoryL2: row.categoryL2,
      categoryL3: row.categoryL3,
      region: row.region,
      rank: row.rank,
      rankPeriod: row.rankPeriod,
      sales7d: row.sales7d,
      sales30d: row.sales30d,
      gmv30d: row.gmv30d != null ? String(row.gmv30d) : null,
      growthRate: row.growthRate != null ? String(row.growthRate) : null,
      commissionRate: row.commissionRate != null ? String(row.commissionRate) : null,
      videoCount: row.videoCount,
      creatorCount: row.creatorCount,
      isHot: row.isHot ?? false,
      momentumScore: String(momentum),
      metadata: row.metadata ?? {},
    };

    // Some existing installations predate the unique constraint used by the
    // original ON CONFLICT clause. Update by the full tenant-scoped identity,
    // then insert only when today's snapshot does not exist.
    const updated = await db
      .update(marketProducts)
      .set(values)
      .where(
        and(
          eq(marketProducts.workspaceId, workspaceId),
          eq(marketProducts.source, source),
          eq(marketProducts.sourceProductId, row.sourceProductId),
          eq(marketProducts.snapshotDate, today)
        )
      )
      .returning({ id: marketProducts.id });

    if (updated.length === 0) {
      await db.insert(marketProducts).values({
        workspaceId,
        source,
        sourceProductId: row.sourceProductId,
        snapshotDate: today,
        ...values,
      });
    }
  }
  return rows.length;
}

/** Realistic US TikTok Shop winners (clearly synthetic — dry-run only). */
export function sampleProducts(period: MarketQuery["period"]): MarketProduct[] {
  const samples = [
    { name: "LED Strip Lights 16.4ft", priceMin: 6.99, priceMax: 12.99, sales7d: 18400, sales30d: 152000, gmv30d: 1280000, growthRate: 0.42, commissionRate: 0.18, videoCount: 3420, creatorCount: 1180, categoryL1: "Home & Living" },
    { name: "Portable Neck Fan 5000mAh", priceMin: 15.99, priceMax: 19.99, sales7d: 12700, sales30d: 98000, gmv30d: 1760000, growthRate: 0.31, commissionRate: 0.2, videoCount: 2180, creatorCount: 940, categoryL1: "Electronics" },
    { name: "Bathroom Organizer Set", priceMin: 9.99, priceMax: 16.99, sales7d: 9800, sales30d: 71000, gmv30d: 890000, growthRate: 0.27, commissionRate: 0.15, videoCount: 1560, creatorCount: 620, categoryL1: "Home & Living" },
    { name: "3-in-1 Wireless Charging Station", priceMin: 22.99, priceMax: 29.99, sales7d: 8400, sales30d: 54000, gmv30d: 1450000, growthRate: 0.24, commissionRate: 0.15, videoCount: 1240, creatorCount: 480, categoryL1: "Electronics" },
    { name: "Mini Waffle Maker (Heart Shape)", priceMin: 8.99, priceMax: 13.99, sales7d: 7200, sales30d: 46000, gmv30d: 560000, growthRate: 0.38, commissionRate: 0.2, videoCount: 1890, creatorCount: 760, categoryL1: "Kitchen" },
    { name: "Waist Trimmer Belt", priceMin: 12.99, priceMax: 17.99, sales7d: 6900, sales30d: 41000, gmv30d: 620000, growthRate: 0.19, commissionRate: 0.25, videoCount: 980, creatorCount: 430, categoryL1: "Fitness" },
    { name: "Pet Hair Remover Roller", priceMin: 7.99, priceMax: 10.99, sales7d: 6100, sales30d: 39000, gmv30d: 340000, growthRate: 0.29, commissionRate: 0.18, videoCount: 1120, creatorCount: 510, categoryL1: "Pets" },
    { name: "Waterproof Phone Pouch", priceMin: 4.99, priceMax: 8.99, sales7d: 5700, sales30d: 33000, gmv30d: 210000, growthRate: 0.22, commissionRate: 0.2, videoCount: 870, creatorCount: 390, categoryL1: "Travel" },
    { name: "Curling Iron Brush", priceMin: 19.99, priceMax: 25.99, sales7d: 5200, sales30d: 29000, gmv30d: 680000, growthRate: 0.35, commissionRate: 0.22, videoCount: 2040, creatorCount: 830, categoryL1: "Beauty" },
    { name: "Garlic Chopper (Pulse)", priceMin: 5.99, priceMax: 9.99, sales7d: 4900, sales30d: 27000, gmv30d: 190000, growthRate: 0.26, commissionRate: 0.15, videoCount: 760, creatorCount: 340, categoryL1: "Kitchen" },
  ];
  return samples.map((s, i) => ({
    source: "echotik",
    sourceProductId: `dryrun-${i + 1}`,
    name: s.name,
    imageUrl: null,
    priceMin: s.priceMin,
    priceMax: s.priceMax,
    currency: "USD",
    categoryL1: s.categoryL1,
    categoryL2: null,
    categoryL3: null,
    region: "US",
    rank: i + 1,
    rankPeriod: period,
    sales7d: s.sales7d,
    sales30d: s.sales30d,
    gmv30d: s.gmv30d,
    growthRate: s.growthRate,
    commissionRate: s.commissionRate,
    videoCount: s.videoCount,
    creatorCount: s.creatorCount,
    isHot: s.growthRate >= 0.3,
    momentumScore: [64, 42, -18, 31, 55, 12, -27, 8, 39, -5][i] ?? 0,
    metadata: { dryRun: true, sample: true },
  }));
}

// ─── Creators / affiliate layer ──────────────────────────────────────────────

/** Realistic TikTok Shop creators (clearly synthetic — dry-run only). */
export function sampleCreators(): MarketCreator[] {
  const samples = [
    { name: "@vegas.lifestyle", followers: 1840000, engagementRate: 0.061, rating: 4.9, videoCount: 38, salesForProduct: 12400 },
    { name: "@nightout.justin", followers: 892000, engagementRate: 0.048, rating: 4.7, videoCount: 27, salesForProduct: 8600 },
    { name: "@clubguide.vegas", followers: 645000, engagementRate: 0.055, rating: 4.8, videoCount: 19, salesForProduct: 5900 },
    { name: "@bottle.boss", followers: 412000, engagementRate: 0.039, rating: 4.5, videoCount: 14, salesForProduct: 3100 },
    { name: "@table.reservations", followers: 298000, engagementRate: 0.044, rating: 4.6, videoCount: 11, salesForProduct: 2400 },
    { name: "@poolparty.diaries", followers: 756000, engagementRate: 0.052, rating: 4.8, videoCount: 23, salesForProduct: 6700 },
  ];
  return samples.map((s, i) => ({
    source: "echotik" as MarketSource,
    sourceCreatorId: `dryrun-creator-${i + 1}`,
    name: s.name,
    avatarUrl: null,
    followers: s.followers,
    engagementRate: s.engagementRate,
    region: "US",
    rating: s.rating,
    videoCount: s.videoCount,
    salesForProduct: s.salesForProduct,
    metadata: { dryRun: true, sample: true },
  }));
}

/** Creators driving a product. Dry-run returns samples (not stored). */
export async function fetchCreators(
  source: MarketSource,
  sourceProductId: string
): Promise<{ rows: MarketCreator[]; dryRun: boolean }> {
  if (dryRunEnabled()) {
    return { rows: sampleCreators(), dryRun: true };
  }
  if (source === "echotik") {
    return { rows: await echotikImpl().fetchProductCreators(sourceProductId), dryRun: false };
  }
  throw new Error(`[market] creator feed not implemented for source: ${source}`);
}

/** Per-product drill-down: panorama + 180-day trend (EchoTik detail + trend). */
export async function fetchProductAnalytics(
  source: MarketSource,
  sourceProductId: string
): Promise<ProductAnalytics> {
  if (source !== "echotik") {
    throw new Error(`[market] analytics not implemented for source: ${source}`);
  }
  return echotikImpl().fetchProductAnalytics(sourceProductId);
}

/**
 * Videos featuring a product (content layer): sorted by video GMV, enriched
 * with paid-promotion ("Promote") + recency deltas. Dry-run returns no rows.
 */
export async function fetchProductVideos(
  source: MarketSource,
  sourceProductId: string,
  limit = 10
): Promise<{ rows: MarketProductVideo[]; dryRun: boolean }> {
  if (dryRunEnabled()) return { rows: [], dryRun: true };
  if (source === "echotik") {
    return { rows: await echotikImpl().fetchProductVideos(sourceProductId, limit), dryRun: false };
  }
  throw new Error(`[market] product videos not implemented for source: ${source}`);
}

/**
 * Every product sold by a seller/brand ("click a brand → all their products").
 * Dry-run returns no rows.
 */
export async function fetchSellerProducts(
  source: MarketSource,
  sellerId: string,
  limit = 24
): Promise<{ rows: MarketProduct[]; dryRun: boolean }> {
  if (dryRunEnabled()) return { rows: [], dryRun: true };
  if (source === "echotik") {
    return { rows: await echotikImpl().fetchSellerProducts(sellerId, limit), dryRun: false };
  }
  throw new Error(`[market] seller products not implemented for source: ${source}`);
}

/**
 * Global search across entity types (products / influencers / shops / videos).
 * Only the EchoTik site adapter implements this — the paid API platform
 * adapter has no equivalent surface, and FastMoss isn't wired for it.
 */
export async function searchMarketEntities(
  type: MarketSearchType,
  keyword: string,
  region = "US",
  limit = 20
): Promise<{ rows: (MarketProduct | MarketInfluencer | MarketShop | MarketProductVideo)[]; dryRun: boolean }> {
  if (dryRunEnabled()) return { rows: [], dryRun: true };
  const impl = echotikImpl();
  switch (type) {
    case "product":
      return { rows: await impl.searchProducts({ period: "day", region, keyword, limit }), dryRun: false };
    case "influencer":
      if (!("searchInfluencers" in impl)) break;
      return { rows: await impl.searchInfluencers(keyword, region, limit), dryRun: false };
    case "shop":
      if (!("searchShops" in impl)) break;
      return { rows: await impl.searchShops(keyword, region, limit), dryRun: false };
    case "video":
      if (!("searchVideos" in impl)) break;
      return { rows: await impl.searchVideos(keyword, region, limit), dryRun: false };
  }
  throw new Error(`[market] entity search not implemented for source: echotik (API adapter)`);
}

/** Every product promoted by a creator (influencers/{id}/products). */
export async function fetchInfluencerProducts(influencerId: string, limit = 24) {
  if (dryRunEnabled()) return { rows: [], dryRun: true };
  const impl = echotikImpl();
  if (!("fetchInfluencerProducts" in impl)) {
    throw new Error(`[market] influencer products not implemented for source: echotik (API adapter)`);
  }
  return { rows: await impl.fetchInfluencerProducts(influencerId, limit), dryRun: false };
}

/**
 * Products a creator promoted in the last `days` days ("what are they pushing
 * right now") — walks their recent videos, dedupes the nested products.
 * Requires the website-session adapter (ECHOTIK_WEB_TOKEN).
 */
export async function fetchRecentInfluencerProducts(influencerId: string, days = 14, limit = 60) {
  if (dryRunEnabled()) return { rows: [], dryRun: true };
  const impl = echotikImpl();
  if (!("fetchRecentInfluencerProducts" in impl)) {
    throw new Error(`[market] recent influencer products not implemented for source: echotik (API adapter)`);
  }
  return { rows: await impl.fetchRecentInfluencerProducts(influencerId, days, limit), dryRun: false };
}

/**
 * Top creators by sales/volume (champion-sales leaderboard + siblings).
 * Website-session adapter only (needs ECHOTIK_WEB_COOKIE for the newer
 * leaderboard endpoints). 1 request per combo, cached 4h — quota-frugal.
 */
export async function fetchTopCreators(query: {
  period?: "day" | "week" | "month";
  role?: "creator" | "seller" | "all";
  board?: "champion-sales" | "followers" | "followers-increment" | "darkhorse-creator" | "darkhorse-seller" | "hot-live" | "most-views-live";
  limit?: number;
  categoryId?: string;
} = {}) {
  if (dryRunEnabled()) return { rows: [], dryRun: true };
  const impl = echotikImpl();
  if (!("fetchTopCreators" in impl)) {
    throw new Error(`[market] top creators not implemented for source: echotik (API adapter)`);
  }
  return { rows: await impl.fetchTopCreators(query), dryRun: false };
}

/** Leaderboard filter options (time ranges, roles, categories) for the UI. */
export async function getLeaderboardFilters() {
  const impl = echotikImpl();
  if (!("getLeaderboardFilters" in impl)) {
    throw new Error(`[market] leaderboard filters not implemented for source: echotik (API adapter)`);
  }
  return impl.getLeaderboardFilters();
}

/**
 * Persists creator profiles + product↔creator junction for a market product
 * (upsert by source+id+date / creator+product+date). Returns rows persisted.
 */
export async function ingestCreators(
  workspaceId: string,
  marketProductId: string,
  source: MarketSource,
  rows: MarketCreator[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const row of rows) {
    // Upsert creator profile.
    const [creator] = await db
      .insert(marketCreators)
      .values({
        workspaceId,
        source,
        sourceCreatorId: row.sourceCreatorId,
        name: row.name,
        avatarUrl: row.avatarUrl,
        followers: row.followers,
        engagementRate: row.engagementRate != null ? String(row.engagementRate) : null,
        region: row.region,
        rating: row.rating != null ? String(row.rating) : null,
        snapshotDate: today,
        metadata: row.metadata ?? {},
      })
      .onConflictDoUpdate({
        target: [marketCreators.source, marketCreators.sourceCreatorId, marketCreators.snapshotDate],
        set: {
          name: row.name,
          avatarUrl: row.avatarUrl,
          followers: row.followers,
          engagementRate: row.engagementRate != null ? String(row.engagementRate) : null,
          region: row.region,
          rating: row.rating != null ? String(row.rating) : null,
        },
      })
      .returning({ id: marketCreators.id });

    if (!creator) continue;

    // Upsert product↔creator junction.
    await db
      .insert(marketProductCreators)
      .values({
        workspaceId,
        creatorId: creator.id,
        productId: marketProductId,
        videoCount: row.videoCount,
        salesForProduct: row.salesForProduct,
        snapshotDate: today,
      })
      .onConflictDoUpdate({
        target: [
          marketProductCreators.creatorId,
          marketProductCreators.productId,
          marketProductCreators.snapshotDate,
        ],
        set: {
          videoCount: row.videoCount,
          salesForProduct: row.salesForProduct,
        },
      });
  }
  return rows.length;
}
