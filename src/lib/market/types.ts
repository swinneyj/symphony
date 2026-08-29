/**
 * Market research — normalized winning-product intel from research sources.
 * Adapters normalize each source's shape into MarketProduct.
 */

export type MarketSource = "echotik" | "fastmoss";

export type RankPeriod = "day" | "week" | "month";

export interface MarketQuery {
  period: RankPeriod;
  region?: string;        // "US" default
  category?: string;      // L1 category id
  categoryL2?: string;    // L2 category id
  categoryL3?: string;    // L3 category id
  limit?: number;         // default 50
  // ── Product Library filters (EchoTik product/list) ──
  priceMin?: number;
  priceMax?: number;
  commissionMin?: number;     // fraction, e.g. 0.15 = 15%
  commissionMax?: number;
  influencersMin?: number;    // creators driving the product
  influencersMax?: number;
  videosMin?: number;         // videos featuring the product
  videosMax?: number;
  viewsMin?: number;          // total video views
  viewsMax?: number;
  ratingMin?: number;         // product experience points (rating)
  ratingMax?: number;
  reviewsMin?: number;        // comment count
  reviewsMax?: number;
  salesMin?: number;          // total sales
  salesMax?: number;
  sales30dMin?: number;       // 30-day sales
  sales30dMax?: number;
  gmvMin?: number;            // total GMV
  gmvMax?: number;
  gmv30dMin?: number;         // 30-day GMV
  gmv30dMax?: number;
  salesTrend?: 0 | 1 | 2;     // 7-day sales trend: 0=flat 1=up 2=down
  isSShop?: boolean;          // full-managed (S-shop)
  freeShipping?: boolean;
  brandStore?: boolean;       // shop_type = brand store
  fromFlag?: 1 | 2;           // shop type: 1=local 2=cross-border
  isHot?: boolean;            // hot product flag
  onSaleOnly?: boolean;       // off_mark=0 (exclude delisted)
  salesFlag?: 1 | 2;          // main sales method: 1=video 2=live
  newProductsDays?: number;   // first crawl within last N days (new products)
  sortField?: "sales" | "gmv" | "price" | "sales7d" | "sales30d" | "gmv7d" | "gmv30d";
  sortType?: "asc" | "desc";
}

export interface MarketProduct {
  /** Stored snapshot row id — present when the product was persisted. */
  id?: string;
  /** Linked in-app product id — present when adopted. */
  productId?: string | null;
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
  region: string | null;
  rank: number | null;
  rankPeriod: RankPeriod | string | null;
  sales7d: number | null;
  sales30d: number | null;
  gmv30d: number | null;
  growthRate: number | null;
  commissionRate: number | null;
  videoCount: number | null;
  creatorCount: number | null;
  isHot: boolean;
  momentumScore: number | null;
  metadata?: Record<string, unknown>;
}

/** One daily snapshot in a product's 180-day trend series. */
export interface TrendPoint {
  date: string;
  price: number | null;
  influencers: number | null;
  liveCount: number | null;
  videoCount: number | null;
  sales1d: number | null;
  salesTotal: number | null;
  gmv1d: number | null;
  gmvTotal: number | null;
}

/** Per-product drill-down: business panorama + trend (EchoTik detail + trend). */
export interface ProductAnalytics {
  productId: string;
  name: string | null;
  imageUrl: string | null;
  priceMin: number | null;
  priceMax: number | null;
  commissionRate: number | null;
  rating: number | null;
  reviewCount: number | null;
  sellerId: string | null;
  salesTrend: number | null;        // 0=flat 1=up 2=down
  firstCrawlDate: string | null;    // yyyyMMdd
  isSShop: boolean;
  freeShipping: boolean;
  brandStore: boolean;
  fromFlag: number | null;          // 1=local 2=cross-border
  totalSales: number | null;
  totalGmv: number | null;
  /** 1/7/15/30/60/90-day live/video/influencer/sales/GMV breakdown. */
  panorama: {
    period: number;
    sales: number | null;
    gmv: number | null;
    videoCnt: number | null;
    videoSales: number | null;
    liveCnt: number | null;
    liveSales: number | null;
    influencers: number | null;
  }[];
  trend: TrendPoint[];
}

/** A creator (influencer) driving sales for a specific market product. */
export interface MarketCreator {
  source: MarketSource;
  sourceCreatorId: string;
  name: string;
  avatarUrl: string | null;
  followers: number | null;
  engagementRate: number | null;
  region: string | null;
  rating: number | null;
  /** Videos this creator posted promoting the product. */
  videoCount: number | null;
  /** Creator's own sales attributed to the product (if source provides). */
  salesForProduct: number | null;
  metadata?: Record<string, unknown>;
}

/** One video featuring a product (product/video/list + video/detail batch). */
export interface MarketProductVideo {
  videoId: string;
  /** Creator's TikTok unique_id (handle, without @). */
  creatorName: string | null;
  creatorId: string | null;
  description: string | null;
  coverUrl: string | null;
  /** Direct mp4 URL — EchoTik notes these can expire; falls back to cover. */
  playUrl: string | null;
  /** Unix seconds. */
  createTime: string | null;
  duration: number | null;
  region: string | null;
  views: number | null;
  views1d: number | null;
  views7d: number | null;
  views30d: number | null;
  diggs: number | null;
  diggs1d: number | null;
  diggs7d: number | null;
  diggs30d: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  sales: number | null;
  gmv: number | null;
  /** Paid promotion ("Promote" badge in EchoTik) — video/detail is_ad. */
  isAd: boolean;
  isAi: boolean | null;
  /** Main sales method: 0 = non-product video, 1 = video, 2 = live. */
  salesFlag: number | null;
  hashTags: string[] | null;
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
