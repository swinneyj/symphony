import { NextResponse } from "next/server";
import { db } from "@/db";
import { marketProducts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { fetchWinningProducts } from "@/lib/market";

/**
 * GET /api/cron/market-refresh?secret=...&workspaceId=...
 * Daily refresh hook for winning-product snapshots. Guarded by CRON_SECRET
 * (Vercel cron pattern). Without source credentials it returns 200 + skipped
 * so a cron can run before provisioning.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const results: Record<string, unknown> = {};

  for (const source of ["echotik", "fastmoss"] as const) {
    try {
      const { rows, dryRun } = await fetchWinningProducts(source, {
        period: "day",
        region: "US",
        limit: 50,
      });
      if (dryRun) {
        results[source] = { skipped: "dry-run mode — no creds provisioned" };
        continue;
      }
      let stored = 0;
      for (const row of rows) {
        await db
          .insert(marketProducts)
          .values({
            workspaceId,
            source: row.source,
            sourceProductId: row.sourceProductId,
            name: row.name,
            imageUrl: row.imageUrl,
            priceMin: row.priceMin ? String(row.priceMin) : null,
            priceMax: row.priceMax ? String(row.priceMax) : null,
            currency: row.currency,
            categoryL1: row.categoryL1,
            categoryL2: row.categoryL2,
            categoryL3: row.categoryL3,
            region: row.region,
            rank: row.rank,
            rankPeriod: row.rankPeriod,
            sales7d: row.sales7d,
            sales30d: row.sales30d,
            gmv30d: row.gmv30d ? String(row.gmv30d) : null,
            growthRate: row.growthRate ? String(row.growthRate) : null,
            commissionRate: row.commissionRate ? String(row.commissionRate) : null,
            videoCount: row.videoCount,
            creatorCount: row.creatorCount,
            isHot: row.isHot,
            snapshotDate: new Date(today),
            metadata: row.metadata ?? {},
          })
          .onConflictDoUpdate({
            target: [marketProducts.source, marketProducts.sourceProductId, marketProducts.snapshotDate],
            set: { name: row.name, sales7d: row.sales7d, gmv30d: row.gmv30d ? String(row.gmv30d) : null, rank: row.rank },
          });
        stored++;
      }
      results[source] = { stored };
    } catch (error) {
      results[source] = { error: error instanceof Error ? error.message : "failed" };
    }
  }

  return NextResponse.json({ date: today, results });
}

// Vercel cron schedule lives in vercel.json (not yet present in this repo) —
// add when deploying: {"crons":[{"path":"/api/cron/market-refresh","schedule":"0 8 * * *"}]}
export const dynamic = "force-dynamic";
