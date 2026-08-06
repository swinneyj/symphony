import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  exchangeTikTokCode,
  fetchTikTokUser,
  getTikTokAccountForMember,
  TIKTOK_OAUTH_COOKIE,
} from "@/lib/tiktok";

type OAuthCookie = {
  state: string;
  workspaceId: string;
  userId: string;
};

function redirectToTikTokPage(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/tiktok", request.url);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = NextResponse.redirect(url);
  response.cookies.delete(TIKTOK_OAUTH_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    return redirectToTikTokPage(request, {
      error: request.nextUrl.searchParams.get("error_description") || error,
    });
  }

  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const cookieValue = request.cookies.get(TIKTOK_OAUTH_COOKIE)?.value;
  if (!code || !returnedState || !cookieValue) {
    return redirectToTikTokPage(request, { error: "invalid_oauth_response" });
  }

  try {
    const oauthState = JSON.parse(
      Buffer.from(cookieValue, "base64url").toString("utf8")
    ) as OAuthCookie;

    if (oauthState.state !== returnedState || oauthState.userId !== session.user.id) {
      return redirectToTikTokPage(request, { error: "invalid_oauth_state" });
    }

    const membership = await getTikTokAccountForMember(
      oauthState.workspaceId,
      session.user.id
    );
    if (!membership.authorized) {
      return redirectToTikTokPage(request, { error: "workspace_not_found" });
    }

    const token = await exchangeTikTokCode(code);
    const user = await fetchTikTokUser(token.accessToken);
    const tokenExpiresAt = new Date(Date.now() + token.expiresIn * 1000);
    const metadata = {
      unionId: user.union_id,
      scope: token.scope,
      tokenType: token.tokenType,
      refreshExpiresIn: token.refreshExpiresIn,
      environment: "sandbox",
    };

    const [existing] = await db
      .select({ id: socialAccounts.id })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.workspaceId, oauthState.workspaceId),
          eq(socialAccounts.platform, "tiktok")
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(socialAccounts)
        .set({
          platformAccountId: user.open_id,
          accountName: user.display_name || "TikTok Creator",
          accountUsername: user.display_name || null,
          avatarUrl: user.avatar_url || null,
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          tokenExpiresAt,
          status: "connected",
          metadata,
          updatedAt: new Date(),
        })
        .where(eq(socialAccounts.id, existing.id));
    } else {
      await db.insert(socialAccounts).values({
        workspaceId: oauthState.workspaceId,
        platform: "tiktok",
        platformAccountId: user.open_id,
        accountName: user.display_name || "TikTok Creator",
        accountUsername: user.display_name || null,
        avatarUrl: user.avatar_url || null,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        tokenExpiresAt,
        status: "connected",
        metadata,
      });
    }

    return redirectToTikTokPage(request, { connected: "1" });
  } catch (callbackError) {
    console.error("TikTok callback error:", callbackError);
    return redirectToTikTokPage(request, {
      error: callbackError instanceof Error ? callbackError.message : "connection_failed",
    });
  }
}
