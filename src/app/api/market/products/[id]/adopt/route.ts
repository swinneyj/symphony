import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { marketProducts, products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

/**
 * POST /api/market/products/[id]/adopt
 * One-click: turns a winning-market-product snapshot into a real Product
 * (appears in the Products tab → available for batches/videos).
 * Idempotent: already-adopted rows return the existing product.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const workspaceId = body.workspaceId as string | undefined;
    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [row] = await db
      .select()
      .from(marketProducts)
      .where(eq(marketProducts.id, id))
      .limit(1);
    if (!row || row.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Market product not found" }, { status: 404 });
    }

    if (row.productId) {
      const [existing] = await db
        .select()
        .from(products)
        .where(eq(products.id, row.productId))
        .limit(1);
      if (existing) return NextResponse.json({ product: existing, alreadyAdopted: true });
    }

    const [product] = await db
      .insert(products)
      .values({
        workspaceId,
        createdById: session.user.id,
        name: row.name,
        price: row.priceMin ? String(row.priceMin) : null,
        currency: row.currency ?? "USD",
        originalImageUrl: row.imageUrl,
        sourceType: "link",
        metadata: {
          marketSource: row.source,
          marketSourceProductId: row.sourceProductId,
          marketSnapshotId: row.id,
          rank: row.rank,
          rankPeriod: row.rankPeriod,
          growthRate: row.growthRate ? Number(row.growthRate) : null,
          gmv30d: row.gmv30d ? Number(row.gmv30d) : null,
        },
      })
      .returning();

    await db
      .update(marketProducts)
      .set({ productId: product.id })
      .where(eq(marketProducts.id, row.id));

    return NextResponse.json({ product, alreadyAdopted: false }, { status: 201 });
  } catch (error) {
    console.error("Error adopting market product:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
