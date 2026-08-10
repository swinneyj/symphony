import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workspaceMembers, workspaces } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

const GRAPH_DIALOG = "https://www.facebook.com/v21.0/dialog/oauth";

// Minimal scope set for publishing to a Facebook Page + its linked
// Instagram business account (mirrors the n8n app's granted scopes).
const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
].join(",");

/**
 * GET /api/auth/meta/connect
 * Starts the Meta (Facebook/Instagram) OAuth flow: builds the consent
 * dialog URL, binds a random state to the session + workspace via an
 * httpOnly cookie, and redirects to Facebook.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientId = process.env.META_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: "META_CLIENT_ID is not configured on this deployment" },
        { status: 500 }
      );
    }

    // First workspace the user belongs to, matching GET /api/workspaces
    // ordering (newest first) so accounts land in the workspace the UI shows.
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
    const redirectUri = `${origin}/api/auth/meta/callback`;
    const state = randomUUID();

    const cookieStore = await cookies();
    cookieStore.set(
      "meta_oauth_state",
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

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      scope: SCOPES,
    });

    return NextResponse.redirect(`${GRAPH_DIALOG}?${params.toString()}`);
  } catch (error) {
    console.error("Meta connect error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
