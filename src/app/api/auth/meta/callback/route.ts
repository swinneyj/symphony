import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";

const GRAPH = "https://graph.facebook.com/v21.0";

type StoredState = { state: string; workspaceId: string; userId: string };

async function graphGet(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Graph API ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Graph API error");
  return data;
}

/**
 * GET /api/auth/meta/callback
 * OAuth callback: verifies state (CSRF + session binding), exchanges the
 * code for a long-lived token, lists the user's Facebook Pages and linked
 * Instagram business accounts, and stores them as social_accounts rows.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const origin = new URL(request.url).origin;

  const fail = (err: string) =>
    NextResponse.redirect(
      `${origin}/settings?tab=accounts&error=${encodeURIComponent(err)}`
    );

  if (oauthError || !code || !state) {
    return fail(oauthError || "meta_denied");
  }

  // CSRF + session binding
  let stored: StoredState | null = null;
  try {
    const raw = (await cookies()).get("meta_oauth_state")?.value;
    if (raw) stored = JSON.parse(raw) as StoredState;
  } catch {
    stored = null;
  }
  if (!stored || stored.state !== state) return fail("state_mismatch");

  const session = await auth();
  if (!session?.user?.id || session.user.id !== stored.userId) {
    return fail("session_mismatch");
  }

  const clientId = process.env.META_CLIENT_ID;
  const clientSecret = process.env.META_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("meta_not_configured");

  try {
    // 1. Exchange code -> short-lived token
    const short = await graphGet(
      `${GRAPH}/oauth/access_token?${new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origin}/api/auth/meta/callback`,
        code,
      })}`
    );

    // 2. Exchange -> long-lived (60 day) token
    let token = short.access_token as string;
    let expiresAt: Date | null = null;
    try {
      const long = await graphGet(
        `${GRAPH}/oauth/access_token?${new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: clientId,
          client_secret: clientSecret,
          fb_exchange_token: token,
        })}`
      );
      if (long.access_token) {
        token = long.access_token;
        expiresAt = long.expires_in
          ? new Date(Date.now() + Number(long.expires_in) * 1000)
          : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // expires_in can be omitted → default 60d
      }
    } catch (error) {
      console.warn("Long-lived token exchange failed, using short-lived:", error);
    }

    // 3. Pages + linked IG business accounts
    const me = await graphGet(
      `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&access_token=${encodeURIComponent(token)}`
    );
    const pages: Array<{
      id: string;
      name: string;
      access_token?: string;
      instagram_business_account?: { id: string; username: string; profile_picture_url?: string };
    }> = me.data ?? [];

    if (pages.length === 0) return fail("no_pages");

    // 4. Replace prior Meta rows for this workspace (fresh token each connect)
    await db
      .delete(socialAccounts)
      .where(
        and(
          eq(socialAccounts.workspaceId, stored.workspaceId),
          or(
            eq(socialAccounts.platform, "facebook"),
            eq(socialAccounts.platform, "instagram")
          )
        )
      );

    for (const page of pages) {
      await db.insert(socialAccounts).values({
        workspaceId: stored.workspaceId,
        platform: "facebook",
        platformAccountId: page.id,
        accountName: page.name,
        accountUsername: page.name,
        avatarUrl: null,
        // Page-scoped token (FB publishing uses the page token)
        accessToken: page.access_token || token,
        tokenExpiresAt: expiresAt,
        status: "connected",
        metadata: { type: "page", userId: me.id ?? null },
      });

      const ig = page.instagram_business_account;
      if (ig) {
        await db.insert(socialAccounts).values({
          workspaceId: stored.workspaceId,
          platform: "instagram",
          platformAccountId: ig.id,
          accountName: ig.username,
          accountUsername: ig.username,
          avatarUrl: ig.profile_picture_url || null,
          // IG publishing also uses the page token
          accessToken: page.access_token || token,
          tokenExpiresAt: expiresAt,
          status: "connected",
          metadata: { pageId: page.id, pageName: page.name },
        });
      }
    }

    return NextResponse.redirect(`${origin}/settings?tab=accounts&connected=meta`);
  } catch (error) {
    console.error("Meta OAuth callback failed:", error);
    return fail("meta_failed");
  }
}
