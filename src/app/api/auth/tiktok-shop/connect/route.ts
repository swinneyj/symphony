import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { socialAccounts, workspaceMembers, workspaces } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { buildCreatorAuthUrl } from "@/lib/tiktok-shop";

/**
 * GET /api/auth/tiktok-shop/connect?accountId=<tiktok social_accounts id>
 * Starts the TikTok Shop creator OAuth flow for ONE TikTok account (the
 * shop feature lives ON a TikTok account — no separate shop account rows).
 * Binds state + accountId via httpOnly cookie, redirects to creator auth.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId");
    if (!accountId) {
      return NextResponse.json(
        { error: "accountId is required — pick which TikTok account gets shop access" },
        { status: 400 }
      );
    }

    // The target row must be a connected tiktok account in a workspace the
    // user belongs to (shop access attaches to the TikTok account).
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
    const [target] = await db
      .select({ id: socialAccounts.id })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.id, accountId),
          eq(socialAccounts.workspaceId, membership.workspaceId),
          eq(socialAccounts.platform, "tiktok"),
          eq(socialAccounts.status, "connected")
        )
      )
      .limit(1);
    if (!target) {
      return NextResponse.json(
        { error: "TikTok account not found — connect the TikTok account first" },
        { status: 404 }
      );
    }

    let authUrl: string;
    try {
      const state = randomUUID();
      const origin = new URL(request.url).origin;
      const redirectUri = `${origin}/api/auth/tiktok-shop/callback`;
      authUrl = buildCreatorAuthUrl(redirectUri, state);

      const cookieStore = await cookies();
      cookieStore.set(
        "tiktok_shop_oauth_state",
        JSON.stringify({ state, accountId }),
        { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 600 }
      );
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "TikTok Shop not configured" },
        { status: 501 }
      );
    }

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("tiktok-shop connect error:", error);
    return NextResponse.json({ error: "Failed to start TikTok Shop connect" }, { status: 500 });
  }
}
