/**
 * Market research registry: winning-product feeds from research sources,
 * normalized to MarketProduct. EchoTik is primary (richest documented API),
 * FastMoss secondary. KaloData's *functionality* (period rankings + growth
 * deltas + creator/video activity) is what we replicate — not their API.
 *
 * Dry-run (MARKET_DRY_RUN=1): returns realistic sample rows WITHOUT storing
 * them — the DB only ever sees real source data.
 */
import type { MarketProduct, MarketQuery, MarketSource } from "./types";
import { dryRunEnabled } from "./types";
import * as echotik from "./echotik";
import * as fastmoss from "./fastmoss";
import { db } from "@/db";
import { marketProducts } from "@/db/schema";
import { eq, and, inArray, lt, desc } from "drizzle-orm";

const ADAPTERS: Record<MarketSource, (q: MarketQuery) => Promise<MarketProduct[]>> = {
  echotik: echotik.fetchWinningProducts,
  fastmoss: fastmoss.fetchWinningProducts,
};

export async function fetchWinningProducts(
  source: MarketSource,
  query: MarketQuery
): Promise<{ rows: MarketProduct[]; dryRun: boolean }> {
  if (dryRunEnabled()) {
    return { rows: sampleProducts(query.period), dryRun: true };
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
    await db
      .insert(marketProducts)
      .values({
        workspaceId,
        source,
        sourceProductId: row.sourceProductId,
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
        snapshotDate: today,
      })
      .onConflictDoUpdate({
        target: [marketProducts.source, marketProducts.sourceProductId, marketProducts.snapshotDate],
        set: {
          name: row.name,
          imageUrl: row.imageUrl,
          priceMin: row.priceMin != null ? String(row.priceMin) : null,
          priceMax: row.priceMax != null ? String(row.priceMax) : null,
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
        },
      });
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
