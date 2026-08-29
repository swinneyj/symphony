import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { fetchSellerProducts } from "@/lib/market";
import type { MarketSource } from "@/lib/market/types";

/**
 * GET /api/market/products/seller-products?workspaceId&source=echotik&sellerId=...
 * Every product sold by a seller/brand — the "click a brand → all their
 * products" drill-down (seller/product/list, cached 6h).
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const sellerId = searchParams.get("sellerId");
    const source = (searchParams.get("source") ?? "echotik") as MarketSource;
    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    if (!sellerId) return NextResponse.json({ error: "sellerId required" }, { status: 400 });
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { rows, dryRun } = await fetchSellerProducts(source, sellerId);
    return NextResponse.json({ products: rows, dryRun });
  } catch (error) {
    console.error("Error in market seller products:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    if (msg.includes("credentials missing")) {
      return NextResponse.json({ products: [], notice: msg }, { status: 200 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
