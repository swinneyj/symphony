import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { marketProducts } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { fetchWinningProducts, ingestMarketRows } from "@/lib/market";
import type { MarketQuery, MarketSource } from "@/lib/market/types";

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
    const optionalNumber = (key: string) => {
      const value = searchParams.get(key);
      if (value == null || value === "") return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const minSales30d = optionalNumber("minSales30d");
    const maxSales30d = optionalNumber("maxSales30d");
    const minPrice = optionalNumber("minPrice");
    const maxPrice = optionalNumber("maxPrice");
    const brandOnly = searchParams.get("brandOnly") === "1";
    const refresh = searchParams.get("refresh") === "1";
    const sort = searchParams.get("sort") ?? "rank";

    const numericFilters = [minSales30d, maxSales30d, minPrice, maxPrice];
    if (numericFilters.some((value) => value != null && value < 0)) {
      return NextResponse.json({ error: "Market filters cannot be negative" }, { status: 400 });
    }
    if (minSales30d != null && maxSales30d != null && minSales30d > maxSales30d) {
      return NextResponse.json({ error: "Minimum 30-day units cannot exceed the maximum" }, { status: 400 });
    }
    if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
      return NextResponse.json({ error: "Minimum price cannot exceed the maximum" }, { status: 400 });
    }

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
        minSales30d,
        maxSales30d,
        minPrice,
        maxPrice,
        brandOnly,
      });

      if (!dryRun) {
        // Upsert with momentum computation (rank trajectory vs prior snapshots).
        await ingestMarketRows(workspaceId, source, fetched);
      }

      if (fetched.length === 0) {
        return NextResponse.json({
          rows: [],
          source,
          dryRun,
          stored: !dryRun,
          notice: "No products matched these filters.",
        });
      }

      // Return the fresh snapshot rows (sample rows in dry-run, stored rows otherwise).
      const orderByCol =
        sort === "momentum" ? marketProducts.momentumScore : sort === "gmv" ? marketProducts.gmv30d : marketProducts.rank;
      const stored = await db
        .select()
        .from(marketProducts)
        .where(
          and(
            eq(marketProducts.workspaceId, workspaceId),
            eq(marketProducts.source, source),
            eq(marketProducts.snapshotDate, new Date(today)),
            inArray(marketProducts.sourceProductId, fetched.map((row) => row.sourceProductId))
          )
        )
        .orderBy(desc(orderByCol));

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
    const orderByCol =
      sort === "momentum" ? marketProducts.momentumScore : sort === "gmv" ? marketProducts.gmv30d : marketProducts.rank;
    const rows = await db
      .select()
      .from(marketProducts)
      .where(
        and(eq(marketProducts.workspaceId, workspaceId), eq(marketProducts.source, source))
      )
      .orderBy(desc(marketProducts.snapshotDate), desc(orderByCol))
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
