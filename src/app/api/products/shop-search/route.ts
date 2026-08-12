import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { socialAccounts, workspaceMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getShopCredentials,
  searchShopProducts,
  ShopApiError,
} from "@/lib/tiktok-shop";

export const runtime = "nodejs";

/**
 * POST /api/products/shop-search
 * Search TikTok Shop's affiliate product catalog (Get Shop Products,
 * scope "Affiliate Information" 434372). Discovery only — never writes.
 * Adding a result goes through POST /api/products/shop-add.
 *
 * Body: { workspaceId, keyword?, sortField?, sortOrder?, pageToken?, pageSize? }
 * Requires a connected TikTok Shop creator account (its token signs the call).
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      workspaceId?: string;
      keyword?: string;
      sortField?: "PRODUCT_ID" | "PRICE" | "SALE";
      sortOrder?: "DESC" | "ASC";
      pageToken?: string;
      pageSize?: number;
    };
    if (!body.workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
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

    // TikTok accounts that have shop access (metadata.shop) — the search
    // token comes from the TikTok account, not a separate shop account.
    const connected = await db
      .select({ id: socialAccounts.id, metadata: socialAccounts.metadata })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.workspaceId, body.workspaceId),
          eq(socialAccounts.platform, "tiktok"),
          eq(socialAccounts.status, "connected")
        )
      );

    const shopAccount = connected.find((a) => {
      const shop = (a.metadata ?? {}) as { shop?: { accessToken?: string } };
      return !!shop.shop?.accessToken;
    });

    if (!shopAccount) {
      return NextResponse.json(
        {
          error:
            "No TikTok account has Shop access connected — connect it in Settings → Connected Accounts first",
        },
        { status: 501 }
      );
    }
    const shopToken = ((shopAccount.metadata ?? {}) as { shop?: { accessToken?: string } }).shop
      ?.accessToken;

    const creds = getShopCredentials(shopToken);
    const { products, nextPageToken } = await searchShopProducts(creds, {
      keyword: body.keyword,
      sortField: body.sortField,
      sortOrder: body.sortOrder,
      pageToken: body.pageToken,
      pageSize: body.pageSize,
    });

    return NextResponse.json({ products, nextPageToken });
  } catch (error) {
    if (error instanceof ShopApiError) {
      const msg = error.message.toLowerCase();
      if (msg.includes("app key")) {
        return NextResponse.json(
          {
            error:
              "TikTok Shop app not approved yet — finish the Publish flow in the developer portal (company verification). Search unlocks the moment it lands.",
          },
          { status: 502 }
        );
      }
      if (msg.includes("token")) {
        return NextResponse.json(
          {
            error:
              "Your TikTok Shop creator token needs reconnecting — go to Settings → Connected Accounts and reconnect.",
          },
          { status: 502 }
        );
      }
      return NextResponse.json(
        { error: `TikTok Shop API ${error.status}: ${error.message}` },
        { status: 502 }
      );
    }
    console.error("shop search error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 }
    );
  }
}
