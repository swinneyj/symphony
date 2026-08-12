import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { socialAccounts, workspaceMembers } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId query parameter is required" },
        { status: 400 }
      );
    }

    // Verify user is a member of this workspace
    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const accounts = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.workspaceId, workspaceId))
      .orderBy(desc(socialAccounts.createdAt));

    // Strip sensitive token fields before returning
    const sanitized = accounts.map((account) => ({
      id: account.id,
      workspaceId: account.workspaceId,
      platform: account.platform,
      platformAccountId: account.platformAccountId,
      accountName: account.accountName,
      accountUsername: account.accountUsername,
      avatarUrl: account.avatarUrl,
      status: account.status,
      metadata: account.metadata,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }));

    return NextResponse.json(sanitized);
  } catch (error) {
    console.error("Error listing social accounts:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      workspaceId,
      platform,
      platformAccountId,
      accountName,
      accountUsername,
      avatarUrl,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      metadata,
    } = body;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    if (!platform) {
      return NextResponse.json(
        { error: "Platform is required" },
        { status: 400 }
      );
    }

    const validPlatforms = [
      "tiktok",
      "youtube",
      "instagram",
      "facebook",
      "twitter",
      "linkedin",
    ];
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json(
        {
          error:
            "Invalid platform. Must be one of: tiktok, youtube, instagram, facebook, twitter, linkedin",
        },
        { status: 400 }
      );
    }

    if (!platformAccountId) {
      return NextResponse.json(
        { error: "platformAccountId is required" },
        { status: 400 }
      );
    }

    if (!accountName) {
      return NextResponse.json(
        { error: "accountName is required" },
        { status: 400 }
      );
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: "accessToken is required" },
        { status: 400 }
      );
    }

    // Verify user is a member of this workspace
    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [account] = await db
      .insert(socialAccounts)
      .values({
        workspaceId,
        platform,
        platformAccountId,
        accountName,
        accountUsername: accountUsername || null,
        avatarUrl: avatarUrl || null,
        accessToken,
        refreshToken: refreshToken || null,
        tokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt) : null,
        metadata: metadata || {},
      })
      .returning();

    const { accessToken: _, refreshToken: __, ...sanitized } = account;

    return NextResponse.json(sanitized, { status: 201 });
  } catch (error) {
    console.error("Error creating social account:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
