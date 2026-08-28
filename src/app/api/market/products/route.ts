import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { marketProducts } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { fetchWinningProducts, ingestMarketRows } from "@/lib/market";
import type { MarketQuery, MarketSource } from "@/lib/market/types";

/**
 * Winning-product feed + Products Library search.
 *   GET /api/market/products?workspaceId&source=echotik&period=week&region=US&limit=50
 *     → latest DB snapshots (no fetch)
 *   GET ...&refresh=1
 *     → fetch from source, upsert snapshots, return fresh rows.
 *     Dry-run: returns sample rows WITHOUT storing (DB only holds real data).
 *
 * Product Library filters (any present → live search via product/list, no store):
 *   priceMin/priceMax, commissionMin/commissionMax, influencersMin/Max,
 *   videosMin/Max, viewsMin/Max, ratingMin/ratingMax, reviewsMin/reviewsMax,
 *   salesMin/salesMax, sales30dMin/Max, gmvMin/gmvMax, gmv30dMin/Max,
 *   salesTrend (0|1|2), sShop (1), freeShipping (1), brandStore (1),
 *   fromFlag (1|2), hot (1), onSaleOnly (1), salesFlag (1|2),
 *   newProductsDays (N), sortField, sortType (asc|desc)
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
    const sort = searchParams.get("sort") ?? "rank";

    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // ── Parse Product Library filters ──
    const num = (k: string): number | undefined => {
      const v = searchParams.get(k);
      if (v === null || v === "") return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const flag = (k: string): boolean | undefined => {
      const v = searchParams.get(k);
      if (v === null || v === "") return undefined;
      return v === "1" || v === "true";
    };
    const query: MarketQuery = {
      period,
      region,
      category,
      categoryL2: searchParams.get("categoryL2") ?? undefined,
      categoryL3: searchParams.get("categoryL3") ?? undefined,
      limit,
      priceMin: num("priceMin"),
      priceMax: num("priceMax"),
      commissionMin: num("commissionMin"),
      commissionMax: num("commissionMax"),
      influencersMin: num("influencersMin"),
      influencersMax: num("influencersMax"),
      videosMin: num("videosMin"),
      videosMax: num("videosMax"),
      viewsMin: num("viewsMin"),
      viewsMax: num("viewsMax"),
      ratingMin: num("ratingMin"),
      ratingMax: num("ratingMax"),
      reviewsMin: num("reviewsMin"),
      reviewsMax: num("reviewsMax"),
      salesMin: num("salesMin"),
      salesMax: num("salesMax"),
      sales30dMin: num("sales30dMin"),
      sales30dMax: num("sales30dMax"),
      gmvMin: num("gmvMin"),
      gmvMax: num("gmvMax"),
      gmv30dMin: num("gmv30dMin"),
      gmv30dMax: num("gmv30dMax"),
      salesTrend: (num("salesTrend") as 0 | 1 | 2 | undefined),
      isSShop: flag("sShop"),
      freeShipping: flag("freeShipping"),
      brandStore: flag("brandStore"),
      fromFlag: (num("fromFlag") as 1 | 2 | undefined),
      isHot: flag("hot"),
      onSaleOnly: flag("onSaleOnly") ?? false,
      salesFlag: (num("salesFlag") as 1 | 2 | undefined),
      newProductsDays: num("newProductsDays"),
      sortField: (searchParams.get("sortField") as MarketQuery["sortField"]) ?? undefined,
      sortType: (searchParams.get("sortType") as MarketQuery["sortType"]) ?? undefined,
    };
    const hasFilters = [
      query.priceMin, query.priceMax, query.commissionMin, query.commissionMax,
      query.influencersMin, query.influencersMax, query.videosMin, query.videosMax,
      query.viewsMin, query.viewsMax, query.ratingMin, query.ratingMax,
      query.reviewsMin, query.reviewsMax, query.salesMin, query.salesMax,
      query.sales30dMin, query.sales30dMax, query.gmvMin, query.gmvMax,
      query.gmv30dMin, query.gmv30dMax, query.salesTrend, query.isSShop,
      query.freeShipping, query.brandStore, query.fromFlag, query.isHot,
      query.onSaleOnly, query.salesFlag, query.newProductsDays,
      query.categoryL2, query.categoryL3,
      query.sortField != null && query.sortField !== "sales30d", query.sortType,
    ].some((v) => v !== undefined && v !== null && v !== false);

    const today = new Date().toISOString().slice(0, 10);

    if (refresh || hasFilters) {
      const { rows: fetched, dryRun } = await fetchWinningProducts(source, query);

      // Filtered library searches are exploratory — never stored as snapshots.
      if (!dryRun && !hasFilters) {
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

      // Filtered results keep their fresh panorama; attach stored id/productId
      // when today's snapshot already knows the product (enables adopt/watch).
      if (hasFilters && stored.length > 0) {
        const bySpid = new Map(stored.map((s) => [s.sourceProductId, s]));
        for (const row of fetched) {
          const known = bySpid.get(row.sourceProductId);
          if (known) {
            row.id = known.id;
            row.productId = known.productId;
          }
        }
      }

      const outRows = dryRun ? fetched : hasFilters ? fetched : stored;
      return NextResponse.json({
        rows: outRows,
        source,
        dryRun,
        stored: !dryRun && !hasFilters,
        filtered: hasFilters,
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
        and(
          eq(marketProducts.workspaceId, workspaceId),
          eq(marketProducts.source, source),
          // Latest snapshot only — mixing dates shows the same product twice.
          eq(
            marketProducts.snapshotDate,
            db
              .select({ d: marketProducts.snapshotDate })
              .from(marketProducts)
              .where(
                and(
                  eq(marketProducts.workspaceId, workspaceId),
                  eq(marketProducts.source, source)
                )
              )
              .orderBy(desc(marketProducts.snapshotDate))
              .limit(1)
          )
        )
      )
      .orderBy(desc(orderByCol))
      .limit(limit);
    return NextResponse.json({ rows, source, dryRun: false });
  } catch (error) {
    console.error("Error in market products:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    // Credential gaps are expected until sources are provisioned — surface
    // them as 200-with-notice so the UI can guide, not crash.
    if (msg.includes("credentials missing")) {
      return NextResponse.json({ rows: [], notice: msg }, { status: 200 });
    }
    // EchoTik daily usage quota: live search/refresh can't run. Fall back to
    // the latest stored snapshot so the page stays usable until the limit
    // resets (daily), instead of a hard 500.
    if (/usage limit|quota/i.test(msg)) {
      const fbParams = new URL(request.url).searchParams;
      const fbWs = fbParams.get("workspaceId");
      const fbSource = (fbParams.get("source") ?? "echotik") as MarketSource;
      const fbLimit = Math.min(parseInt(fbParams.get("limit") ?? "50", 10), 100);
      if (fbWs) {
        const fallback = await db
          .select()
          .from(marketProducts)
          .where(
            and(
              eq(marketProducts.workspaceId, fbWs),
              eq(marketProducts.source, fbSource),
              eq(
                marketProducts.snapshotDate,
                db
                  .select({ d: marketProducts.snapshotDate })
                  .from(marketProducts)
                  .where(
                    and(
                      eq(marketProducts.workspaceId, fbWs),
                      eq(marketProducts.source, fbSource)
                    )
                  )
                  .orderBy(desc(marketProducts.snapshotDate))
                  .limit(1)
              )
            )
          )
          .orderBy(desc(marketProducts.rank))
          .limit(fbLimit);
        return NextResponse.json(
          {
            rows: fallback,
            source: fbSource,
            dryRun: false,
            stored: true,
            notice: "EchoTik daily usage limit reached — showing the latest stored data. The limit resets daily; try again later.",
          },
          { status: 200 }
        );
      }
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
