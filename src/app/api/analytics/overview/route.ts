import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workspaceMembers, posts, socialAccounts, analyticsSnapshots } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";

/**
 * Analytics overview — REAL data where it exists in our DB:
 * - total posts (published/scheduled/draft)
 * - posts per platform (from posts.platformConfigs + post_platform_status)
 * - connected accounts per platform
 * - recent activity trend (posts created per day, last 7 days)
 *
 * Platform-native metrics (followers, engagement, impressions) stay 0 until
 * platform API integrations write analytics_snapshots rows — the UI shows
 * them as "awaiting platform sync" instead of fabricating numbers.
 */
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

    // ── Real counts from our tables ────────────────────────────────────────
    const [postCounts] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        published: sql<number>`COUNT(*) FILTER (WHERE ${posts.status} = 'published')`,
        scheduled: sql<number>`COUNT(*) FILTER (WHERE ${posts.status} = 'scheduled')`,
        drafts: sql<number>`COUNT(*) FILTER (WHERE ${posts.status} = 'draft')`,
      })
      .from(posts)
      .where(eq(posts.workspaceId, workspaceId));

    const accounts = await db
      .select({ platform: socialAccounts.platform })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.workspaceId, workspaceId),
          eq(socialAccounts.status, "connected")
        )
      );

    // Recent posts (for activity feed + per-platform post counts)
    const recentPosts = await db
      .select({
        id: posts.id,
        content: posts.content,
        status: posts.status,
        platformConfigs: posts.platformConfigs,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .where(eq(posts.workspaceId, workspaceId))
      .orderBy(desc(posts.createdAt))
      .limit(50);

    // Per-platform post counts from platformConfigs keys
    const platformPosts: Record<string, number> = {};
    for (const p of recentPosts) {
      const platforms = Object.keys(p.platformConfigs ?? {});
      const key = platforms.length > 0 ? platforms[0] : "unknown";
      platformPosts[key] = (platformPosts[key] ?? 0) + 1;
    }

    const platformCounts: Record<string, number> = {};
    for (const a of accounts) {
      platformCounts[a.platform] = (platformCounts[a.platform] ?? 0) + 1;
    }

    // Daily post trend for the last 7 days
    const dayMs = 24 * 60 * 60 * 1000;
    const daily = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(Date.now() - (6 - i) * dayMs);
      const dayKey = date.toISOString().split("T")[0];
      const count = recentPosts.filter((p) => {
        const created = new Date(p.createdAt);
        const createdKey = new Date(created.getTime() - created.getTimezoneOffset() * 60000)
          .toISOString()
          .split("T")[0];
        return createdKey === dayKey;
      }).length;
      return { date: dayKey, posts: count };
    });

    // Latest analytics snapshot per platform (written by /api/cron/analytics)
    const snapshots = await db
      .select({
        platform: analyticsSnapshots.platform,
        data: analyticsSnapshots.data,
        snapshotDate: analyticsSnapshots.snapshotDate,
      })
      .from(analyticsSnapshots)
      .where(eq(analyticsSnapshots.workspaceId, workspaceId))
      .orderBy(desc(analyticsSnapshots.snapshotDate))
      .limit(50);

    // Most recent snapshot per platform (snapshots come newest-first)
    const latestByPlatform: Record<string, Record<string, unknown>> = {};
    for (const s of snapshots) {
      if (!latestByPlatform[s.platform]) {
        latestByPlatform[s.platform] = s.data;
      }
    }

    const platforms = ["instagram", "tiktok", "twitter", "facebook", "linkedin", "youtube"];
    const platformBreakdown = platforms.map((platform) => {
      const snap = latestByPlatform[platform] ?? {};
      const followers =
        (snap.followers as number | undefined) ??
        (snap.followers_count as number | undefined) ??
        0;
      const engagement =
        ((snap.recentLikes as number | undefined) ?? 0) +
        ((snap.recentComments as number | undefined) ?? 0);
      return {
        platform,
        followers,
        engagement,
        impressions: (snap.pageViews as number | undefined) ?? 0,
        posts: platformPosts[platform] ?? 0,
        accounts: platformCounts[platform] ?? 0,
        syncedAt:
          typeof snap.capturedAt === "string" ? snap.capturedAt : undefined,
      };
    });

    const totalFollowers = platformBreakdown.reduce(
      (sum, p) => sum + (p.followers ?? 0),
      0
    );
    const totalEngagement = platformBreakdown.reduce(
      (sum, p) => sum + (p.engagement ?? 0),
      0
    );
    const totalImpressions = platformBreakdown.reduce(
      (sum, p) => sum + (p.impressions ?? 0),
      0
    );

    return NextResponse.json({
      workspaceId,
      period: "overall",
      metrics: {
        totalFollowers,
        followersGrowth: { value: 0, percentage: 0, trend: "stable" as const },
        totalEngagement,
        engagementGrowth: { value: 0, percentage: 0, trend: "stable" as const },
        totalImpressions,
        impressionsGrowth: { value: 0, percentage: 0, trend: "stable" as const },
        totalPosts: Number(postCounts.total ?? 0),
        postsGrowth: {
          value: Number(postCounts.published ?? 0),
          percentage: 0,
          trend: "stable" as const,
        },
        publishedPosts: Number(postCounts.published ?? 0),
        scheduledPosts: Number(postCounts.scheduled ?? 0),
        draftPosts: Number(postCounts.drafts ?? 0),
        connectedAccounts: accounts.length,
      },
      platformBreakdown,
      recentTrends: { daily },
      recentPosts: recentPosts.slice(0, 10).map((p) => ({
        id: p.id,
        content: p.content,
        status: p.status,
        platforms: Object.keys(p.platformConfigs ?? {}),
        createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching analytics overview:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
