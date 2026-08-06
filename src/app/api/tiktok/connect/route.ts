import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  getTikTokAccountForMember,
  getTikTokCredentials,
  getTikTokRedirectUri,
  TIKTOK_OAUTH_COOKIE,
  TIKTOK_SCOPES,
} from "@/lib/tiktok";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.redirect(new URL("/tiktok?error=workspace_missing", request.url));
  }

  const membership = await getTikTokAccountForMember(workspaceId, session.user.id);
  if (!membership.authorized) {
    return NextResponse.redirect(new URL("/tiktok?error=workspace_not_found", request.url));
  }

  try {
    const { clientKey } = getTikTokCredentials();
    const state = randomUUID();
    const oauthUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
    oauthUrl.searchParams.set("client_key", clientKey);
    oauthUrl.searchParams.set("scope", TIKTOK_SCOPES.join(","));
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set("redirect_uri", getTikTokRedirectUri());
    oauthUrl.searchParams.set("state", state);
    oauthUrl.searchParams.set("disable_auto_auth", "1");

    const response = NextResponse.redirect(oauthUrl);
    response.cookies.set(
      TIKTOK_OAUTH_COOKIE,
      Buffer.from(
        JSON.stringify({ state, workspaceId, userId: session.user.id })
      ).toString("base64url"),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60,
      }
    );
    return response;
  } catch (error) {
    console.error("TikTok connect error:", error);
    return NextResponse.redirect(new URL("/tiktok?error=configuration", request.url));
  }
}
