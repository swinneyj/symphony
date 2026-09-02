import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import {
  fetchInfluencerProductsPage,
  fetchRecentInfluencerProducts,
} from "@/lib/market";

/**
 * GET /api/market/products/influencer-products
 *   ?workspaceId&source=echotik&influencerId=...
 *   &page&perPage&order&sort&categories&keyword
 *
 * Every product promoted by a creator (influencers/{id}/products, cached 6h),
 * with server-side filters: order (total_sale_cnt | total_gmv_amt |
 * videos_count), sort, product_categories (comma-separated L1 ids), keyword.
 * With ?days=14 → "last N days" extract instead: walks the creator's recent
 * videos (publish-date-desc, cached 30m) and dedupes the nested products.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const influencerId = searchParams.get("influencerId");
    const daysParam = searchParams.get("days");
    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    if (!influencerId) return NextResponse.json({ error: "influencerId required" }, { status: 400 });
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const days = daysParam ? Number(daysParam) : null;
    if (days && Number.isFinite(days) && days > 0) {
      const { rows, dryRun } = await fetchRecentInfluencerProducts(influencerId, days);
      return NextResponse.json({
        products: rows,
        dryRun,
        windowDays: days,
        recency: true,
      });
    }

    const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
    const perPage = Math.min(50, Math.max(1, Number(searchParams.get("perPage") ?? 24) || 24));
    const categories = (searchParams.get("categories") ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const { page: result, dryRun } = await fetchInfluencerProductsPage(influencerId, {
      page,
      perPage,
      order: searchParams.get("order") ?? "",
      sort: searchParams.get("sort") === "asc" ? "asc" : "desc",
      categories: categories.length ? categories : undefined,
      keyword: searchParams.get("keyword") ?? undefined,
    });
    return NextResponse.json({
      products: result.products,
      page: result.page,
      perPage: result.perPage,
      total: result.total,
      lastPage: result.lastPage,
      dryRun,
    });
  } catch (error) {
    console.error("Error in market influencer products:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    if (msg.includes("credentials missing")) {
      return NextResponse.json({ products: [], notice: msg }, { status: 200 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
