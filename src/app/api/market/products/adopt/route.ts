import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { marketProducts, products } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

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

    const source = String(row.source ?? "echotik");
    const sourceProductId = String(row.sourceProductId ?? "");
    if (!sourceProductId) return NextResponse.json({ error: "row.sourceProductId required" }, { status: 400 });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Upsert today's market snapshot so the product link is durable.
    const [snapshot] = await db
      .insert(marketProducts)
      .values({
        workspaceId,
        source,
        sourceProductId,
        name: String(row.name ?? "Unknown product"),
        imageUrl: (row.imageUrl as string) ?? null,
        priceMin: row.priceMin != null ? String(row.priceMin) : null,
        priceMax: row.priceMax != null ? String(row.priceMax) : null,
        currency: (row.currency as string) ?? "USD",
        categoryL1: (row.categoryL1 as string) ?? null,
        region: (row.region as string) ?? "US",
        rank: row.rank != null ? Math.round(Number(row.rank)) : null,
        rankPeriod: (row.rankPeriod as string) ?? "day",
        sales7d: row.sales7d != null ? Math.round(Number(row.sales7d)) : null,
        sales30d: row.sales30d != null ? Math.round(Number(row.sales30d)) : null,
        gmv30d: row.gmv30d != null ? String(row.gmv30d) : null,
        growthRate: row.growthRate != null ? String(row.growthRate) : null,
        commissionRate: row.commissionRate != null ? String(row.commissionRate) : null,
        videoCount: row.videoCount != null ? Math.round(Number(row.videoCount)) : null,
        creatorCount: row.creatorCount != null ? Math.round(Number(row.creatorCount)) : null,
        isHot: Boolean(row.isHot),
        snapshotDate: today,
        metadata: {},
      })
      .onConflictDoUpdate({
        target: [marketProducts.source, marketProducts.sourceProductId, marketProducts.snapshotDate],
        set: {
          name: String(row.name ?? "Unknown product"),
          imageUrl: (row.imageUrl as string) ?? null,
          priceMin: row.priceMin != null ? String(row.priceMin) : null,
          priceMax: row.priceMax != null ? String(row.priceMax) : null,
          gmv30d: row.gmv30d != null ? String(row.gmv30d) : null,
          growthRate: row.growthRate != null ? String(row.growthRate) : null,
          commissionRate: row.commissionRate != null ? String(row.commissionRate) : null,
          videoCount: row.videoCount != null ? Math.round(Number(row.videoCount)) : null,
          creatorCount: row.creatorCount != null ? Math.round(Number(row.creatorCount)) : null,
          isHot: Boolean(row.isHot),
        },
      })
      .returning();

    if (snapshot?.productId) {
      const [existing] = await db
        .select()
        .from(products)
        .where(eq(products.id, snapshot.productId))
        .limit(1);
      if (existing) return NextResponse.json({ product: existing, alreadyAdopted: true });
    }

    const [product] = await db
      .insert(products)
      .values({
        workspaceId,
        createdById: session.user.id,
        name: String(row.name ?? "Unknown product"),
        price: row.priceMin != null ? String(row.priceMin) : null,
        currency: (row.currency as string) ?? "USD",
        originalImageUrl: (row.imageUrl as string) ?? null,
        sourceType: "link",
        metadata: {
          marketSource: source,
          marketSourceProductId: sourceProductId,
          marketSnapshotId: snapshot?.id,
          rank: row.rank ?? null,
          rankPeriod: row.rankPeriod ?? "day",
          growthRate: row.growthRate != null ? Number(row.growthRate) : null,
          gmv30d: row.gmv30d != null ? Number(row.gmv30d) : null,
        },
      })
      .returning();

    if (snapshot) {
      await db
        .update(marketProducts)
        .set({ productId: product.id })
        .where(and(eq(marketProducts.id, snapshot.id)));
    }

    return NextResponse.json({ product, alreadyAdopted: false }, { status: 201 });
  } catch (error) {
    console.error("Error adopting live market product:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
