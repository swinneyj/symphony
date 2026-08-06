import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { marketProducts, marketCreators, marketProductCreators } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { fetchCreators, ingestCreators } from "@/lib/market";
import type { MarketSource } from "@/lib/market/types";

const src = (product: { source: string }) => product.source as MarketSource;

/**
 * GET /api/market/products/[id]/creators?refresh=1
 * Creators driving a market product (affiliate layer).
 * refresh=1 → fetch from source, persist, return stored rows.
 * Dry-run: sample rows WITHOUT storing (DB only holds real data).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") === "1";

    const [product] = await db
      .select()
      .from(marketProducts)
      .where(eq(marketProducts.id, id));
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await hasWorkspaceAccess(product.workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let notice: string | undefined;
    let dryRun = false;

    if (refresh) {
      const { rows, dryRun: dr } = await fetchCreators(src(product), product.sourceProductId);
      dryRun = dr;
      if (!dr) {
        await ingestCreators(product.workspaceId, product.id, src(product), rows);
      } else {
        notice = "Sample creators — set source credentials for real data.";
      }
    }

    const stored = await db
      .select({
        id: marketCreators.id,
        source: marketCreators.source,
        sourceCreatorId: marketCreators.sourceCreatorId,
        name: marketCreators.name,
        avatarUrl: marketCreators.avatarUrl,
        followers: marketCreators.followers,
        engagementRate: marketCreators.engagementRate,
        region: marketCreators.region,
        rating: marketCreators.rating,
        videoCount: marketProductCreators.videoCount,
        salesForProduct: marketProductCreators.salesForProduct,
      })
      .from(marketProductCreators)
      .innerJoin(marketCreators, eq(marketProductCreators.creatorId, marketCreators.id))
      .where(
        and(
          eq(marketProductCreators.productId, id),
          eq(marketProductCreators.snapshotDate, product.snapshotDate)
        )
      )
      .orderBy(desc(marketProductCreators.salesForProduct))
      .limit(50);

    const rows = dryRun
      ? (await fetchCreators(src(product), product.sourceProductId)).rows
      : stored;
    return NextResponse.json({ rows, source: product.source, dryRun, notice });
  } catch (error) {
    console.error("Error in market creators:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    if (msg.includes("credentials missing")) {
      return NextResponse.json({ rows: [], notice: msg }, { status: 200 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
