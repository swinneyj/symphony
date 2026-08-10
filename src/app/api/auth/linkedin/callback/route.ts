import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { exchangeLinkedInCode, fetchLinkedInProfile } from "@/lib/linkedin";

type StoredState = { state: string; workspaceId: string; userId: string };

/**
 * GET /api/auth/linkedin/callback
 * Verifies state, exchanges code for a token, fetches the profile, stores
 * the social_accounts row.
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
    return fail(oauthError || "linkedin_denied");
  }

  let stored: StoredState | null = null;
  try {
    const raw = (await cookies()).get("linkedin_oauth_state")?.value;
    if (raw) stored = JSON.parse(raw) as StoredState;
  } catch {
    stored = null;
  }
  if (!stored || stored.state !== state) return fail("state_mismatch");

  const session = await auth();
  if (!session?.user?.id || session.user.id !== stored.userId) {
    return fail("session_mismatch");
  }

  try {
    const tokens = await exchangeLinkedInCode(code);
    const profile = await fetchLinkedInProfile(tokens.access_token);

    const existing = await db
      .select({ id: socialAccounts.id })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.workspaceId, stored.workspaceId),
          eq(socialAccounts.platform, "linkedin"),
          eq(socialAccounts.platformAccountId, profile.personUrn)
        )
      )
      .limit(1);

    const values = {
      workspaceId: stored.workspaceId,
      platform: "linkedin" as const,
      platformAccountId: profile.personUrn,
      accountName: profile.name,
      accountUsername: profile.name,
      accountAvatarUrl: profile.avatarUrl ?? null,
      accessToken: tokens.access_token,
      refreshToken: null,
      tokenExpiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
      status: "connected" as const,
      metadata: { email: profile.email ?? null },
    };

    if (existing.length > 0) {
      await db
        .update(socialAccounts)
        .set(values)
        .where(eq(socialAccounts.id, existing[0].id));
    } else {
      await db.insert(socialAccounts).values(values);
    }

    return NextResponse.redirect(
      `${origin}/settings?tab=accounts&connected=linkedin`
    );
  } catch (error) {
    console.error("LinkedIn callback error:", error);
    return fail(
      error instanceof Error ? error.message.slice(0, 80) : "linkedin_failed"
    );
  }
}
