/** FastMoss MCP adapter. */
/* The MCP SDK exposes tool payloads as dynamically-shaped JSON. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { MarketProduct, MarketQuery, MarketSource } from "./types";
import { MissingSourceCredentialsError } from "./types";

const MCP_URL = "https://mcp.fastmoss.com/mcp";
type JsonRecord = Record<string, any>;

function apiKey(): string {
  if (!process.env.FASTMOSS_API_KEY) throw new MissingSourceCredentialsError("fastmoss", ["FASTMOSS_API_KEY"]);
  return process.env.FASTMOSS_API_KEY;
}

async function callTool(name: string, args: JsonRecord): Promise<{ data: any; meta: JsonRecord }> {
  const client = new Client({ name: "symphony-market-research", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey()}` } },
  });
  try {
    await client.connect(transport);
    const result: any = await client.callTool({ name, arguments: args });
    if (result.isError) throw new Error(`[fastmoss] ${name} failed`);
    const text = result.content?.find((item: any) => item.type === "text") as { text?: string } | undefined;
    if (!text?.text) throw new Error(`[fastmoss] ${name} returned no data`);
    return { data: JSON.parse(text.text), meta: (result as any)._meta ?? {} };
  } finally {
    await client.close().catch(() => undefined);
  }
}

function completedWeek(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const start = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((thursday.getTime() - start.getTime()) / 86400000) + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function integer(v: unknown): number | null { const n = num(v); return n == null ? null : Math.round(n); }

function normalize(row: JsonRecord, rank: number, query: MarketQuery, meta: JsonRecord): MarketProduct {
  const category = row.category ?? {};
  const periodSales = row.period_units_sold ?? row.units_sold ?? row.sales;
  const periodGmv = row.period_gmv ?? row.gmv;
  const commissionPercent = num(row.commission_rate_percent ?? row.commission_rate);
  return {
    source: "fastmoss" as MarketSource,
    sourceProductId: String(row.product_id ?? row.id ?? rank),
    name: String(row.title ?? row.product_title ?? row.name ?? "Unknown product"),
    imageUrl: row.cover_url ?? row.product_image ?? row.image ?? null,
    priceMin: num(row.floor_price ?? row.min_price ?? row.price),
    priceMax: num(row.ceiling_price ?? row.max_price ?? row.price),
    currency: String(row.currency_code ?? row.currency ?? "USD"),
    categoryL1: category.l1?.name ?? row.category_name ?? null,
    categoryL2: category.l2?.name ?? null,
    categoryL3: category.l3?.name ?? null,
    region: String(row.region ?? query.region ?? "US"),
    rank: integer(row.rank ?? rank), rankPeriod: query.period,
    sales7d: query.period === "week" ? integer(periodSales) : integer(row.sales_7d ?? periodSales),
    sales30d: integer(row.total_units_sold ?? row.sales_30d),
    gmv30d: num(row.total_gmv ?? row.gmv_30d ?? periodGmv),
    growthRate: num(row.units_sold_growth_rate_percent ?? row.growth_rate),
    commissionRate: commissionPercent == null ? null : commissionPercent / 100,
    videoCount: integer(row.video_count ?? row.related_video_count),
    creatorCount: integer(row.creator_count ?? row.affiliate_count),
    isHot: Boolean(row.is_hot ?? false), momentumScore: null,
    metadata: { fastmoss: row, mcp: meta },
  };
}

/** One credit: top-selling leaderboard for a completed period. */
export async function fetchWinningProducts(query: MarketQuery): Promise<MarketProduct[]> {
  const { data, meta } = await callTool("product_rank_top_selling", {
    filter: {
      region: query.region ?? "US", date_type: query.period,
      date_value: query.period === "week" ? completedWeek() : new Date().toISOString().slice(0, 10),
      ...(query.category ? { category_id: query.category } : {}),
    },
    orderby: [{ field: query.sortField === "sales" ? "period_units_sold" : "period_gmv", order: query.sortType ?? "desc" }],
    page: 1, pagesize: Math.min(query.limit ?? 50, 100),
  });
  const rows = Array.isArray(data?.list) ? data.list : Array.isArray(data) ? data : [];
  return rows.map((row: JsonRecord, i: number) => normalize(row, i + 1, query, meta));
}

/** Explicit drill-down; call only for shortlisted products (3 tool calls). */
export async function fetchProductResearch(sourceProductId: string, days = 7) {
  const [overview, creators, videos] = await Promise.all([
    callTool("product_overview", { filter: { product_id: sourceProductId, time_range_days: days } }),
    callTool("product_creator_analysis", { filter: { product_id: sourceProductId }, page: 1, pagesize: 100 }),
    callTool("product_video_list", { filter: { product_id: sourceProductId, time_range_days: days, is_ad: true }, orderby: [{ field: "gmv", order: "desc" }], page: 1, pagesize: 100 }),
  ]);
  return { overview: overview.data, creators: creators.data, videos: videos.data, credits: [overview, creators, videos].map((r) => r.meta.charge ?? null) };
}

/** Lower-cost overview-only enrichment (3 credits). */
export async function fetchProductOverview(sourceProductId: string, days = 7) {
  const result = await callTool("product_overview", { filter: { product_id: sourceProductId, time_range_days: days } });
  return { data: result.data, charge: result.meta.charge ?? null };
}

/** Product basics and canonical TikTok Shop detail URL (1 credit). */
export async function fetchProductDetail(sourceProductId: string) {
  const result = await callTool("product_detail_info", { filter: { product_id: sourceProductId } });
  return { data: result.data, charge: result.meta.charge ?? null };
}
