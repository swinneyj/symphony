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
 * Pulls the TikTok Shop product catalog for EVERY connected tiktok_shop
 * creator account in the workspace and upserts into products
 * (source_type = "tiktok_showcase", dedup on tiktok_product_id).
 *
 * Multi-account safe:
 *  - products track which creator account(s) they came from
 *    (metadata.creatorAccountIds)
 *  - the removal pass is PER ACCOUNT: a product is only deleted when NO
 *    connected account still has it in its catalog
 *  - manual + link imports are never touched
 *
 * Returns { added, updated, removed, accounts: [{name, added, updated,
 * removed, total}], total } — no fake numbers, ever.
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

    // TikTok accounts that have shop access (metadata.shop) — shop is a
    // feature of the TikTok account, not a separate account type.
    const connected = await db
      .select({
        id: socialAccounts.id,
        accountName: socialAccounts.accountName,
        metadata: socialAccounts.metadata,
      })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.workspaceId, workspaceId),
          eq(socialAccounts.platform, "tiktok"),
          eq(socialAccounts.status, "connected")
        )
      );

    const shopAccounts = connected.filter((a) => {
      const shop = (a.metadata ?? {}) as { shop?: { accessToken?: string } };
      return !!shop.shop?.accessToken;
    });

    if (shopAccounts.length === 0) {
      return NextResponse.json(
        {
          error:
            "No TikTok account has Shop access connected — connect it in Settings → Connected Accounts first",
        },
        { status: 501 }
      );
    }

    // Existing showcase products for this workspace (all accounts).
    const existing = await db
      .select({
        id: products.id,
        tiktokProductId: products.tiktokProductId,
        name: products.name,
        metadata: products.metadata,
      })
      .from(products)
      .where(
        and(
          eq(products.workspaceId, workspaceId),
          eq(products.sourceType, "tiktok_showcase"),
          isNotNull(products.tiktokProductId)
        )
      );

    const existingById = new Map(
      existing
        .filter((e) => e.tiktokProductId)
        .map((e) => [e.tiktokProductId as string, e])
    );

    const accountResults: Array<{
      name: string;
      added: number;
      updated: number;
      removed: number;
      total: number;
    }> = [];
    let grandAdded = 0;
    let grandUpdated = 0;
    let grandRemoved = 0;
    const allShopIds = new Map<string, Set<string>>(); // productId -> account ids that have it

    for (const acct of shopAccounts) {
      const shop = ((acct.metadata ?? {}) as { shop?: { accessToken?: string } }).shop;
      let creds;
      try {
        creds = getShopCredentials(shop?.accessToken);
      } catch (e) {
        accountResults.push({
          name: acct.accountName,
          added: 0,
          updated: 0,
          removed: 0,
          total: 0,
        });
        continue;
      }

      const shopProducts = await fetchAllShopProducts(creds);
      const accountAdded = [];
      const accountUpdated = [];

      for (const sp of shopProducts) {
        const prior = existingById.get(sp.id);
        const prevAccountIds = new Set<string>(
          (prior?.metadata?.creatorAccountIds as string[] | undefined) ?? []
        );
        prevAccountIds.add(acct.id);
        const values = {
          name: sp.name.slice(0, 255),
          description: sp.description?.slice(0, 2000) ?? null,
          price: sp.price ?? null,
          currency: sp.currency ?? "USD",
          originalImageUrl: sp.mainImageUrl ?? null,
          sourceType: "tiktok_showcase" as const,
          sourceUrl: sp.detailLink ?? `https://www.tiktok.com/view/product/${sp.id}`,
          tiktokProductId: sp.id,
          metadata: {
            shopStatus: sp.status ?? null,
            creatorAccountIds: [...prevAccountIds],
          },
        };

        if (prior) {
          await db.update(products).set(values).where(eq(products.id, prior.id));
          accountUpdated.push(sp.id);
        } else {
          await db.insert(products).values({
            workspaceId,
            createdById: session.user.id,
            ...values,
            status: "raw",
          });
          accountAdded.push(sp.id);
        }

        const entry = allShopIds.get(sp.id) ?? new Set<string>();
        entry.add(acct.id);
        allShopIds.set(sp.id, entry);
      }

      // ─── Per-account removal pass ────────────────────────────────────────
      // Products tagged with THIS account but no longer in THIS account's
      // catalog lose the tag; when the last account drops a product, delete it.
      const thisAccountIds = new Set(shopProducts.map((sp) => sp.id));
      const stale = existing.filter((e) => {
        const ids = (e.metadata?.creatorAccountIds as string[] | undefined) ?? [];
        return (
          e.tiktokProductId &&
          ids.includes(acct.id) &&
          !thisAccountIds.has(e.tiktokProductId)
        );
      });
      let accountRemoved = 0;
      for (const p of stale) {
        const ids = new Set<string>(
          (p.metadata?.creatorAccountIds as string[] | undefined) ?? []
        );
        ids.delete(acct.id);
        if (ids.size === 0) {
          await db.delete(products).where(eq(products.id, p.id));
        } else {
          await db
            .update(products)
            .set({ metadata: { ...(p.metadata ?? {}), creatorAccountIds: [...ids] } })
            .where(eq(products.id, p.id));
        }
        accountRemoved++;
      }

      accountResults.push({
        name: acct.accountName,
        added: accountAdded.length,
        updated: accountUpdated.length,
        removed: accountRemoved,
        total: shopProducts.length,
      });
      grandAdded += accountAdded.length;
      grandUpdated += accountUpdated.length;
      grandRemoved += accountRemoved;
    }

    return NextResponse.json({
      ok: true,
      added: grandAdded,
      updated: grandUpdated,
      removed: grandRemoved,
      accounts: accountResults,
      total: allShopIds.size,
    });
  } catch (error) {
    console.error("shop showcase sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
