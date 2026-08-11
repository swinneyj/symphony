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

    const connected = await db
      .select({ accessToken: socialAccounts.accessToken })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.workspaceId, body.workspaceId),
          eq(socialAccounts.platform, "tiktok_shop"),
          eq(socialAccounts.status, "connected")
        )
      )
      .limit(1);

    if (connected.length === 0) {
      return NextResponse.json(
        {
          error:
            "No TikTok Shop creator connected — connect your creator account in Settings → Connected Accounts first",
        },
        { status: 501 }
      );
    }

    const creds = getShopCredentials(connected[0].accessToken);
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
