import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { adoptMarketProduct } from "@/lib/market/adopt-product";

/**
 * POST /api/market/products/adopt
 * Adopt a LIVE search result (no stored snapshot yet) straight into Products.
 * Body: { workspaceId, row: { source, sourceProductId, name, imageUrl,
 *        priceMin, priceMax, currency, commissionRate, growthRate, gmv30d,
 *        rank, rankPeriod } }
 * Upserts today's market snapshot (so the row is linkable/idempotent), then
 * creates the Product. Safe to call twice — second call returns existing.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const workspaceId = body.workspaceId as string | undefined;
    const row = (body.row ?? {}) as Record<string, unknown>;
    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { product, alreadyAdopted } = await adoptMarketProduct(workspaceId, session.user.id, row);
    return NextResponse.json({ product, alreadyAdopted }, { status: alreadyAdopted ? 200 : 201 });
  } catch (error) {
    console.error("Error adopting live market product:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
