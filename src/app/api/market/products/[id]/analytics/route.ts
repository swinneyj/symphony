import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { marketProducts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { fetchProductAnalytics } from "@/lib/market";
import type { MarketSource } from "@/lib/market/types";

/**
 * GET /api/market/products/[id]/analytics
 * Per-product drill-down: business panorama (1/7/15/30/60/90-day live/video/
 * influencer/sales/GMV breakdown) + 180-day daily trend series, fetched live
 * from EchoTik (detail + trend endpoints). Guarded by workspace access.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const [product] = await db
      .select()
      .from(marketProducts)
      .where(eq(marketProducts.id, id));
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await hasWorkspaceAccess(product.workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const analytics = await fetchProductAnalytics(
      product.source as MarketSource,
      product.sourceProductId
    );
    return NextResponse.json({ analytics });
  } catch (error) {
    console.error("Error in market analytics:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    if (msg.includes("credentials missing")) {
      return NextResponse.json({ analytics: null, notice: msg }, { status: 200 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
