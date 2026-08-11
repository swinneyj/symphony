import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { products, workspaceMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * POST /api/products/shop-add
 * Add a product found via TikTok Shop search into the workspace product list.
 *
 * Body: { workspaceId, product: { id, name, description?, price?, currency?,
 *         mainImageUrl?, detailLink?, addedStatus?, sellerName? } }
 *
 * Stored as source_type = "link" with the TikTok product id, so the
 * showcase-removal pass never touches it. If a showcase row already exists
 * for the same product, this is a no-op ("already in your list").
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      workspaceId?: string;
      product?: {
        id?: string;
        name?: string;
        description?: string | null;
        price?: string | null;
        currency?: string | null;
        mainImageUrl?: string | null;
        detailLink?: string | null;
        addedStatus?: string | null;
        sellerName?: string | null;
      };
    };
    const product = body.product;
    if (!body.workspaceId || !product?.id || !product.name) {
      return NextResponse.json(
        { error: "workspaceId and product {id, name} are required" },
        { status: 400 }
      );
    }

    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, body.workspaceId),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);
    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const tiktokId = String(product.id).trim();

    const existing = await db
      .select({
        id: products.id,
        sourceType: products.sourceType,
        metadata: products.metadata,
      })
      .from(products)
      .where(
        and(
          eq(products.workspaceId, body.workspaceId),
          eq(products.tiktokProductId, tiktokId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0];
      if (row.sourceType === "tiktok_showcase") {
        // Already in the workspace via the showcase sync — nothing to do.
        return NextResponse.json({ ok: true, added: false, alreadyExists: true });
      }
      // Refresh price/image/name but keep its source_type.
      await db
        .update(products)
        .set({
          name: product.name.slice(0, 255),
          description: product.description?.slice(0, 2000) ?? null,
          price: product.price ?? null,
          currency: product.currency ?? "USD",
          originalImageUrl: product.mainImageUrl ?? null,
          metadata: {
            ...((row.metadata as Record<string, unknown>) ?? {}),
            origin: "shop_search",
            addedStatus: product.addedStatus ?? null,
            sellerName: product.sellerName ?? null,
          },
        })
        .where(eq(products.id, row.id));
      return NextResponse.json({ ok: true, added: false, updated: true });
    }

    const [created] = await db
      .insert(products)
      .values({
        workspaceId: body.workspaceId,
        createdById: session.user.id,
        name: product.name.slice(0, 255),
        description: product.description?.slice(0, 2000) ?? null,
        price: product.price ?? null,
        currency: product.currency ?? "USD",
        originalImageUrl: product.mainImageUrl ?? null,
        sourceType: "link",
        sourceUrl:
          product.detailLink ??
          `https://www.tiktok.com/view/product/${tiktokId}`,
        tiktokProductId: tiktokId,
        status: "raw",
        metadata: {
          origin: "shop_search",
          addedStatus: product.addedStatus ?? null,
          sellerName: product.sellerName ?? null,
        },
      })
      .returning();

    return NextResponse.json({ ok: true, added: true, product: created });
  } catch (error) {
    console.error("shop add error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Add failed" },
      { status: 500 }
    );
  }
}
