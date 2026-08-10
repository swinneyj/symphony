import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  exchangeCodeForToken,
  fetchTikTokUser,
  tiktokClientKey,
  tiktokClientSecret,
} from "@/lib/tiktok/auth";

const GRAPH_ERRORS: Record<string, string> = {
  access_denied: "TikTok authorization was denied.",
  state_mismatch: "Security check failed — please try again.",
};

/**
 * GET /api/auth/tiktok/callback?code=…&state=…
 * Exchanges the code for a token, fetches the TikTok profile, and upserts one
 * social_accounts row per connected identity (append-only — connecting a
 * second TikTok account adds it alongside the first). Redirects back to
 * Settings → Accounts with a `connected=tiktok` flag.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    const message = GRAPH_ERRORS[error] ?? `TikTok error: ${error}`;
    return NextResponse.redirect(
      `${origin}/settings?tab=accounts&tiktok_error=${encodeURIComponent(message)}`
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify the state cookie bound to this session.
    const cookieStore = await cookies();
    const storedRaw = cookieStore.get("tiktok_oauth_state")?.value;
    let stored: { state?: string; workspaceId?: string; userId?: string } | null = null;
    try {
      stored = storedRaw ? JSON.parse(storedRaw) : null;
    } catch {
      stored = null;
    }
    if (
      !stored ||
      !stored.state ||
      !stored.workspaceId ||
      !code ||
      !state ||
      stored.state !== state ||
      stored.userId !== session.user.id
    ) {
      return NextResponse.redirect(
        `${origin}/settings?tab=accounts&tiktok_error=${encodeURIComponent("state_mismatch")}`
      );
    }
    cookieStore.delete("tiktok_oauth_state");

    const clientKey = tiktokClientKey();
    const clientSecret = tiktokClientSecret();
    if (!clientKey || !clientSecret) {
      return NextResponse.redirect(
        `${origin}/settings?tab=accounts&tiktok_error=${encodeURIComponent("TikTok credentials are not configured on this deployment")}`
      );
    }

    // 1. Code → access token (+ rotating refresh token, 24h access / 365d refresh).
    const token = await exchangeCodeForToken({
      clientKey,
      clientSecret,
      code,
      redirectUri: `${origin}/api/auth/tiktok/callback`,
    });

    // 2. Profile for display.
    const user = await fetchTikTokUser(token.accessToken);

    // 3. Upsert by (workspaceId, platform, platformAccountId=open_id) —
    //    append-only per identity; re-connecting the same handle refreshes it.
    const expiresAt = token.expiresIn
      ? new Date(Date.now() + token.expiresIn * 1000)
      : null;
    const existing = await db
      .select({ id: socialAccounts.id })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.workspaceId, stored.workspaceId),
          eq(socialAccounts.platform, "tiktok"),
          eq(socialAccounts.platformAccountId, user.openId)
        )
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(socialAccounts)
        .set({
          accountName: user.displayName,
          accountUsername: user.username || null,
          avatarUrl: user.avatarUrl,
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          tokenExpiresAt: expiresAt,
          status: "connected",
          updatedAt: new Date(),
        })
        .where(eq(socialAccounts.id, existing[0].id));
    } else {
      await db.insert(socialAccounts).values({
        workspaceId: stored.workspaceId,
        platform: "tiktok",
        platformAccountId: user.openId,
        accountName: user.displayName,
        accountUsername: user.username || null,
        avatarUrl: user.avatarUrl,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        tokenExpiresAt: expiresAt,
        status: "connected",
        metadata: { type: "tiktok_identity" },
      });
    }

    return NextResponse.redirect(`${origin}/settings?tab=accounts&connected=tiktok`);
  } catch (error) {
    console.error("TikTok OAuth callback failed:", error);
    const message =
      error instanceof Error ? error.message : "TikTok connection failed";
    return NextResponse.redirect(
      `${origin}/settings?tab=accounts&tiktok_error=${encodeURIComponent(message)}`
    );
  }
}
