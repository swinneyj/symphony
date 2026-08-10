import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workspaceMembers, workspaces } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getYouTubeCredentials, getYouTubeRedirectUri, YOUTUBE_SCOPES } from "@/lib/youtube";

/**
 * GET /api/auth/youtube/connect
 * Starts the YouTube (Google OAuth) flow: consent URL + state cookie.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clientId } = getYouTubeCredentials();
    if (!clientId) {
      return NextResponse.json(
        { error: "YouTube/Google OAuth is not configured on this deployment" },
        { status: 500 }
      );
    }

    // First workspace the user belongs to (newest first), same as /api/workspaces
    const [membership] = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, session.user.id))
      .orderBy(desc(workspaces.createdAt))
      .limit(1);
    if (!membership) {
      return NextResponse.json({ error: "No workspace for user" }, { status: 404 });
    }

    const state = randomUUID();
    const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    oauthUrl.searchParams.set("client_id", clientId);
    oauthUrl.searchParams.set("redirect_uri", getYouTubeRedirectUri());
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set("scope", YOUTUBE_SCOPES);
    oauthUrl.searchParams.set("access_type", "offline");
    oauthUrl.searchParams.set("prompt", "consent");
    oauthUrl.searchParams.set("state", state);

    const cookieStore = await cookies();
    cookieStore.set(
      "youtube_oauth_state",
      JSON.stringify({ state, workspaceId: membership.workspaceId, userId: session.user.id }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 10 * 60,
      }
    );

    return NextResponse.redirect(oauthUrl);
  } catch (error) {
    console.error("YouTube connect error:", error);
    return NextResponse.redirect(new URL("/settings?tab=accounts&error=youtube_not_configured", request.url));
  }
}
