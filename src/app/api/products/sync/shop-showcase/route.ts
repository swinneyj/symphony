import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { products, workspaceMembers } from "@/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { getShopCredentials, fetchAllShopProducts } from "@/lib/tiktok-shop";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/products/sync/shop-showcase
 *
 * Pulls the workspace's TikTok Shop product catalog and upserts into
 * products (source_type = "tiktok_showcase", dedup on tiktok_product_id).
 *
 * Returns { added, updated, skipped, total } — no fake numbers, ever.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId } = (await request.json().catch(() => ({}))) as {
      workspaceId?: string;
    };
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);
    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let creds;
    try {
      creds = getShopCredentials();
    } catch {
      return NextResponse.json(
        { error: "TikTok Shop is not configured — add TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET, TIKTOK_SHOP_CIPHER to the environment" },
        { status: 501 }
      );
    }

    const shopProducts = await fetchAllShopProducts(creds);

    // Existing products for this workspace keyed by tiktok_product_id
    const existing = await db
      .select({ id: products.id, tiktokProductId: products.tiktokProductId, name: products.name })
      .from(products)
      .where(
        and(
          eq(products.workspaceId, workspaceId),
          isNotNull(products.tiktokProductId)
        )
      );

    const existingById = new Map(
      existing
        .filter((e) => e.tiktokProductId)
        .map((e) => [e.tiktokProductId as string, e])
    );

    let added = 0;
    let updated = 0;
    const skipped: string[] = [];

    for (const sp of shopProducts) {
      const prior = existingById.get(sp.id);
      const values = {
        name: sp.name.slice(0, 255),
        description: sp.description?.slice(0, 2000) ?? null,
        price: sp.price ?? null,
        currency: sp.currency ?? "USD",
        originalImageUrl: sp.mainImageUrl ?? null,
        sourceType: "tiktok_showcase" as const,
        sourceUrl: `https://www.tiktok.com/view/product/${sp.id}`,
        tiktokProductId: sp.id,
        metadata: { shopStatus: sp.status ?? null },
      };

      if (prior) {
        // Only update when something meaningful changed (avoid churn).
        await db.update(products).set(values).where(eq(products.id, prior.id));
        updated++;
      } else {
        await db.insert(products).values({
          workspaceId,
          createdById: session.user.id,
          ...values,
          status: "raw",
        });
        added++;
      }
    }

    return NextResponse.json({
      ok: true,
      added,
      updated,
      skipped: skipped.length,
      total: shopProducts.length,
    });
  } catch (error) {
    console.error("shop showcase sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
