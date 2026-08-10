import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { products, socialAccounts, workspaceMembers } from "@/db/schema";
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
      // Creator flow: static app_key/secret from env + LIVE access token from
      // the connected tiktok_shop social account in this workspace.
      const connected = await db
        .select({
          accessToken: socialAccounts.accessToken,
          refreshToken: socialAccounts.refreshToken,
          tokenExpiresAt: socialAccounts.tokenExpiresAt,
          platformAccountId: socialAccounts.platformAccountId,
        })
        .from(socialAccounts)
        .where(
          and(
            eq(socialAccounts.workspaceId, workspaceId),
            eq(socialAccounts.platform, "tiktok_shop"),
            eq(socialAccounts.status, "connected")
          )
        )
        .limit(1);
      if (!connected[0]?.accessToken) {
        return NextResponse.json(
          {
            error:
              "No TikTok Shop creator connected — connect your creator account in Settings → Connected Accounts first",
          },
          { status: 501 }
        );
      }
      creds = getShopCredentials(connected[0].accessToken);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "TikTok Shop is not configured" },
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

    // ─── Removal pass (full circle) ─────────────────────────────────────────
    // Products that came FROM the shop (source_type = tiktok_showcase) but are
    // no longer in the shop's catalog were removed by the seller on TikTok —
    // reflect that here. Manual + link imports are never touched.
    const shopIds = new Set(shopProducts.map((sp) => sp.id));
    const stale = await db
      .select({ id: products.id, tiktokProductId: products.tiktokProductId })
      .from(products)
      .where(
        and(
          eq(products.workspaceId, workspaceId),
          eq(products.sourceType, "tiktok_showcase"),
          isNotNull(products.tiktokProductId)
        )
      );
    const staleToDelete = stale.filter(
      (p) => p.tiktokProductId && !shopIds.has(p.tiktokProductId)
    );
    let removed = 0;
    for (const p of staleToDelete) {
      await db.delete(products).where(eq(products.id, p.id));
      removed++;
    }

    return NextResponse.json({
      ok: true,
      added,
      updated,
      skipped: skipped.length,
      removed,
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
