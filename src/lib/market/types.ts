/**
 * Market research — normalized winning-product intel from research sources.
 * Adapters normalize each source's shape into MarketProduct.
 */

export type MarketSource = "echotik" | "fastmoss";

export type RankPeriod = "day" | "week" | "month";

export interface MarketQuery {
  period: RankPeriod;
  region?: string;        // "US" default
  category?: string;      // source category id or name
  limit?: number;         // default 50
}

export interface MarketProduct {
  source: MarketSource;
  sourceProductId: string;
  name: string;
  imageUrl: string | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
  categoryL1: string | null;
  categoryL2: string | null;
  categoryL3: string | null;
  region: string;
  rank: number | null;
  rankPeriod: RankPeriod;
  sales7d: number | null;
  sales30d: number | null;
  gmv30d: number | null;
  growthRate: number | null;       // period-over-period sales growth
  commissionRate: number | null;
  videoCount: number | null;
  creatorCount: number | null;
  isHot: boolean;
  metadata?: Record<string, unknown>;
}

export class MissingSourceCredentialsError extends Error {
  constructor(source: MarketSource, keys: string[]) {
    super(
      `[market:${source}] credentials missing: ${keys.join(", ")}. ` +
        `Set them (see .env.example) — or MARKET_DRY_RUN=1 for sample data.`
    );
    this.name = "MissingSourceCredentialsError";
  }
}

export function dryRunEnabled(): boolean {
  return ["1", "true"].includes((process.env.MARKET_DRY_RUN ?? "").toLowerCase());
}
