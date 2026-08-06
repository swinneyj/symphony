import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { marketProducts } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { fetchWinningProducts } from "@/lib/market";
import { dryRunEnabled, type MarketQuery, type MarketSource } from "@/lib/market/types";

/**
 * Winning-product feed.
 *   GET /api/market/products?workspaceId&source=echotik&period=week&region=US&limit=50
 *     → latest DB snapshots (no fetch)
 *   GET ...&refresh=1
 *     → fetch from source, upsert snapshots, return fresh rows.
 *     Dry-run: returns sample rows WITHOUT storing (DB only holds real data).
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const source = (searchParams.get("source") ?? "echotik") as MarketSource;
    const period = (searchParams.get("period") ?? "day") as MarketQuery["period"];
    const region = searchParams.get("region") ?? "US";
    const category = searchParams.get("category") ?? undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);
    const refresh = searchParams.get("refresh") === "1";

    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const today = new Date().toISOString().slice(0, 10);

    if (refresh) {
      const { rows: fetched, dryRun } = await fetchWinningProducts(source, {
        period,
        region,
        category,
        limit,
      });

      if (!dryRun) {
        // Upsert snapshots (unique: source + source_product_id + snapshot_date).
        for (const row of fetched) {
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
              set: {
                name: row.name,
                imageUrl: row.imageUrl,
                priceMin: row.priceMin ? String(row.priceMin) : null,
                priceMax: row.priceMax ? String(row.priceMax) : null,
                sales7d: row.sales7d,
                sales30d: row.sales30d,
                gmv30d: row.gmv30d ? String(row.gmv30d) : null,
                growthRate: row.growthRate ? String(row.growthRate) : null,
                commissionRate: row.commissionRate ? String(row.commissionRate) : null,
                videoCount: row.videoCount,
                creatorCount: row.creatorCount,
                isHot: row.isHot,
                rank: row.rank,
              },
            });
        }
      }

      // Return the fresh snapshot rows (sample rows in dry-run, stored rows otherwise).
      const stored = await db
        .select()
        .from(marketProducts)
        .where(
          and(
            eq(marketProducts.workspaceId, workspaceId),
            eq(marketProducts.source, source),
            eq(marketProducts.snapshotDate, new Date(today))
          )
        )
        .orderBy(desc(marketProducts.rank));

      const outRows = dryRun ? fetched : stored;
      return NextResponse.json({
        rows: outRows,
        source,
        dryRun,
        stored: !dryRun,
        notice: dryRun ? "Sample data — set source credentials for real data (or MARKET_DRY_RUN=0)." : undefined,
      });
    }

    // No refresh: latest stored snapshots for this source.
    const rows = await db
      .select()
      .from(marketProducts)
      .where(
        and(eq(marketProducts.workspaceId, workspaceId), eq(marketProducts.source, source))
      )
      .orderBy(desc(marketProducts.snapshotDate), desc(marketProducts.rank))
      .limit(limit);
    return NextResponse.json({ rows, source, dryRun: false });
  } catch (error) {
    console.error("Error in market products:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    // Credential gaps are expected until Slippaz provisions sources — surface
    // them as 200-with-notice so the UI can guide, not crash.
    if (msg.includes("credentials missing")) {
      return NextResponse.json({ rows: [], notice: msg }, { status: 200 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
