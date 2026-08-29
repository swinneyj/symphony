import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { adoptMarketProduct } from "@/lib/market/adopt-product";

/**
 * POST /api/market/products/bulk-adopt
 * Adopt many LIVE market rows into Products in one call (e.g. "pull last 14
 * days of a creator's products" → add them all). Same semantics as the single
 * adopt route per row: idempotent, already-adopted rows return the existing
 * product. Per-row errors never fail the whole batch.
 * Body: { workspaceId, rows: MarketRow[] }
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const workspaceId = body.workspaceId as string | undefined;
    const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : [];
    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    if (rows.length === 0) return NextResponse.json({ error: "rows required" }, { status: 400 });
    if (rows.length > 100) return NextResponse.json({ error: "max 100 rows per call" }, { status: 400 });
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const results: Array<{
      sourceProductId: string;
      productId: string | null;
      alreadyAdopted: boolean;
      error?: string;
    }> = [];
    let added = 0;
    let already = 0;
    let failed = 0;

    for (const row of rows) {
      const sourceProductId = String(row.sourceProductId ?? "");
      try {
        const { product, alreadyAdopted } = await adoptMarketProduct(workspaceId, session.user.id, row);
        if (alreadyAdopted) already += 1;
        else added += 1;
        results.push({ sourceProductId, productId: product.id, alreadyAdopted });
      } catch (error) {
        failed += 1;
        results.push({
          sourceProductId,
          productId: null,
          alreadyAdopted: false,
          error: error instanceof Error ? error.message : "Adopt failed",
        });
      }
    }

    return NextResponse.json({ results, added, already, failed });
  } catch (error) {
    console.error("Error bulk adopting market products:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
