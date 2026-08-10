import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workspaceMembers, workspaces } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { tiktokAuthorizeUrl, tiktokClientKey } from "@/lib/tiktok/auth";

/**
 * GET /api/auth/tiktok/connect
 * Starts the TikTok OAuth flow: builds the Login Kit authorize URL, binds a
 * random state to the session + workspace via an httpOnly cookie, and
 * redirects to TikTok. Each completed connect adds ONE more TikTok account —
 * repeat the flow to connect additional accounts (e.g. 3 TikTok handles).
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientKey = tiktokClientKey();
    if (!clientKey) {
      return NextResponse.json(
        { error: "AUTH_TIKTOK_CLIENT_KEY is not configured on this deployment" },
        { status: 500 }
      );
    }

    // First workspace the user belongs to (matches GET /api/workspaces
    // ordering) so accounts land in the workspace the UI shows.
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

    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/auth/tiktok/callback`;
    const state = randomUUID();

    const cookieStore = await cookies();
    cookieStore.set(
      "tiktok_oauth_state",
      JSON.stringify({
        state,
        workspaceId: membership.workspaceId,
        userId: session.user.id,
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        maxAge: 600, // 10 minutes
        path: "/",
      }
    );

    return NextResponse.redirect(tiktokAuthorizeUrl({ clientKey, redirectUri, state }));
  } catch (error) {
    console.error("TikTok connect error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
