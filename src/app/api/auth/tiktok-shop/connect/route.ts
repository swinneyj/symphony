import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workspaceMembers, workspaces } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { buildCreatorAuthUrl } from "@/lib/tiktok-shop";

/**
 * GET /api/auth/tiktok-shop/connect
 * Starts the TikTok Shop creator OAuth flow. Binds state + workspace via
 * httpOnly cookie, redirects to the creator authorization page.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        JSON.stringify({ state }),
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
