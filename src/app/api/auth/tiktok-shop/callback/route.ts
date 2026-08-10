import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { socialAccounts, workspaceMembers, workspaces } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { exchangeCreatorCode, getShopCredentials } from "@/lib/tiktok-shop";

/**
 * GET /api/auth/tiktok-shop/callback?code=…&state=…
 * Exchanges the creator auth code for tokens and stores ONE social_accounts
 * row per creator open_id (append-only — multiple creators supported).
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cookieStore = await cookies();
    const storedRaw = cookieStore.get("tiktok_shop_oauth_state")?.value;
    let stored: { state?: string } | null = null;
    try {
      stored = storedRaw ? JSON.parse(storedRaw) : null;
    } catch {
      stored = null;
    }
    if (!stored || !stored.state || !state || stored.state !== state) {
      return NextResponse.redirect(
        `${origin}/settings?tab=accounts&tiktok_shop_error=${encodeURIComponent("state_mismatch")}`
      );
    }
    cookieStore.delete("tiktok_shop_oauth_state");

    if (err === "auth_denied" || !code) {
      return NextResponse.redirect(
        `${origin}/settings?tab=accounts&tiktok_shop_error=${encodeURIComponent(
          err === "auth_denied" ? "Authorization was denied." : "No authorization code returned."
        )}`
      );
    }

    // First workspace the user belongs to (matches other connect routes).
    const membership = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, session.user.id))
      .orderBy(desc(workspaces.createdAt))
      .limit(1);
    if (!membership[0]) {
      return NextResponse.json({ error: "No workspace for user" }, { status: 404 });
    }

    let creds;
    try {
      creds = getShopCredentials(); // app_key + app_secret only; no token needed to exchange
    } catch (e) {
      return NextResponse.redirect(
        `${origin}/settings?tab=accounts&tiktok_shop_error=${encodeURIComponent(
          e instanceof Error ? e.message : "TikTok Shop not configured"
        )}`
      );
    }

    const token = await exchangeCreatorCode({
      appKey: creds.appKey,
      appSecret: creds.appSecret,
      code,
    });

    const expiresAt = token.accessTokenExpireIn
      ? new Date(token.accessTokenExpireIn * 1000)
      : null;
    const refreshExpiresAt = token.refreshTokenExpireIn
      ? new Date(token.refreshTokenExpireIn * 1000)
      : null;

    const existing = await db
      .select({ id: socialAccounts.id })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.workspaceId, membership[0].workspaceId),
          eq(socialAccounts.platform, "tiktok_shop"),
          eq(socialAccounts.platformAccountId, token.openId)
        )
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(socialAccounts)
        .set({
          accountName: "TikTok Shop Creator",
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          tokenExpiresAt: expiresAt,
          metadata: { refreshExpiresAt: refreshExpiresAt?.toISOString(), type: "tiktok_shop_creator" },
          status: "connected",
          updatedAt: new Date(),
        })
        .where(eq(socialAccounts.id, existing[0].id));
    } else {
      await db.insert(socialAccounts).values({
        workspaceId: membership[0].workspaceId,
        platform: "tiktok_shop",
        platformAccountId: token.openId,
        accountName: "TikTok Shop Creator",
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        tokenExpiresAt: expiresAt,
        status: "connected",
        metadata: { refreshExpiresAt: refreshExpiresAt?.toISOString(), type: "tiktok_shop_creator" },
      });
    }

    return NextResponse.redirect(
      `${origin}/settings?tab=accounts&tiktok_shop_connected=1`
    );
  } catch (error) {
    console.error("tiktok-shop callback error:", error);
    return NextResponse.redirect(
      `${origin}/settings?tab=accounts&tiktok_shop_error=${encodeURIComponent(
        error instanceof Error ? error.message : "TikTok Shop connect failed"
      )}`
    );
  }
}
