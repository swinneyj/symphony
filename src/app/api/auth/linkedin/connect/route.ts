import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workspaceMembers, workspaces } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getLinkedInCredentials, getLinkedInRedirectUri, LINKEDIN_SCOPES } from "@/lib/linkedin";

/**
 * GET /api/auth/linkedin/connect
 * Starts the LinkedIn OAuth flow: consent URL + state cookie.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clientId } = getLinkedInCredentials();
    if (!clientId) {
      return NextResponse.json(
        { error: "LinkedIn is not configured on this deployment" },
        { status: 500 }
      );
    }

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
    const oauthUrl = new URL(`${LINKEDIN_OAUTH_PATH()}/authorization`);
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set("client_id", clientId);
    oauthUrl.searchParams.set("redirect_uri", getLinkedInRedirectUri());
    oauthUrl.searchParams.set("scope", LINKEDIN_SCOPES);
    oauthUrl.searchParams.set("state", state);

    const cookieStore = await cookies();
    cookieStore.set(
      "linkedin_oauth_state",
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
    console.error("LinkedIn connect error:", error);
    return NextResponse.redirect(new URL("/settings?tab=accounts&error=linkedin_not_configured", request.url));
  }
}

function LINKEDIN_OAUTH_PATH() {
  return "https://www.linkedin.com/oauth/v2";
}
