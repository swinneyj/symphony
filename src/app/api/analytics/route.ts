import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workspaceMembers, socialAccounts, analyticsSnapshots, posts } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const socialAccountId = searchParams.get("socialAccountId");
    const period = searchParams.get("period") || "daily"; // daily, weekly, monthly
    const from = searchParams.get("from");
    const to = searchParams.get("to");

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

    // If a specific social account was requested, validate it belongs to the workspace
    if (socialAccountId) {
      const account = await db
        .select({ id: socialAccounts.id })
        .from(socialAccounts)
        .where(
          and(
            eq(socialAccounts.id, socialAccountId),
            eq(socialAccounts.workspaceId, workspaceId)
          )
        )
        .limit(1);

      if (account.length === 0) {
        return NextResponse.json(
          { error: "Social account not found in this workspace" },
          { status: 404 }
        );
      }
    }

    // ── Real data from analytics_snapshots (written by platform syncs) ────
    const snapshots = await db
      .select()
      .from(analyticsSnapshots)
      .where(
        and(
          eq(analyticsSnapshots.workspaceId, workspaceId),
          socialAccountId
            ? eq(analyticsSnapshots.socialAccountId, socialAccountId)
            : undefined
        )
      )
      .orderBy(desc(analyticsSnapshots.snapshotDate))
      .limit(90);

    const latest = snapshots[0];
    const metrics = latest?.data ?? null;

    // Content stats are always real from our own tables
    const [contentStats] = await db
      .select({
        postsPublished: sql<number>`COUNT(*) FILTER (WHERE ${posts.status} = 'published')`,
        postsScheduled: sql<number>`COUNT(*) FILTER (WHERE ${posts.status} = 'scheduled')`,
      })
      .from(posts)
      .where(eq(posts.workspaceId, workspaceId));

    const payload = {
      workspaceId,
      socialAccountId: socialAccountId || null,
      period,
      timeframe: {
        from: from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        to: to || new Date().toISOString(),
      },
      metrics: metrics ?? {
        followers: { current: 0, growth: 0, growthRate: 0 },
        engagement: { likes: 0, comments: 0, shares: 0, saves: 0, total: 0, rate: 0 },
        reach: { impressions: 0, reach: 0, frequency: 0 },
        content: {
          postsPublished: Number(contentStats?.postsPublished ?? 0),
          postsScheduled: Number(contentStats?.postsScheduled ?? 0),
          averagePostsPerDay: 0,
        },
      },
      breakdown: snapshots.map((s) => ({
        date: s.snapshotDate,
        period: s.period,
        data: s.data,
      })),
      snapshotCount: snapshots.length,
      // Content stats are live from the posts table; platform metrics fill in
      // as analyticsSnapshots rows arrive from platform API integrations.
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
