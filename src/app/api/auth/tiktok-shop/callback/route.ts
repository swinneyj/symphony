import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { exchangeCreatorCode, getShopCredentials } from "@/lib/tiktok-shop";

/**
 * GET /api/auth/tiktok-shop/callback?code=…&state=…
 * Exchanges the creator auth code for tokens and stores them in the
 * `metadata.shop` of the TikTok account row that started the flow
 * (shop access is a feature OF a TikTok account, not a separate account).
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
    let stored: { state?: string; accountId?: string } | null = null;
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

    // The TikTok account row this shop access belongs to.
    const accountId = stored.accountId;
    if (!accountId) {
      return NextResponse.redirect(
        `${origin}/settings?tab=accounts&tiktok_shop_error=${encodeURIComponent(
          "Missing account binding — start again from Settings → Accounts"
        )}`
      );
    }
    const [target] = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.id, accountId))
      .limit(1);
    if (!target || target.platform !== "tiktok") {
      return NextResponse.redirect(
        `${origin}/settings?tab=accounts&tiktok_shop_error=${encodeURIComponent(
          "TikTok account not found — reconnect the TikTok account first"
        )}`
      );
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

    // Fold shop tokens into the TikTok account's metadata — the account row
    // keeps platform='tiktok' and the shop feature is visible via metadata.shop.
    const existingMetadata = (target.metadata ?? {}) as Record<string, unknown>;
    await db
      .update(socialAccounts)
      .set({
        metadata: {
          ...existingMetadata,
          shop: {
            accessToken: token.accessToken,
            refreshToken: token.refreshToken,
            openId: token.openId,
            accessTokenExpireIn: token.accessTokenExpireIn,
            refreshTokenExpireIn: token.refreshTokenExpireIn,
            connectedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(socialAccounts.id, accountId));

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
