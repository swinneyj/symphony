import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workspaceMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";

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

    // Return mock overview analytics data
    // Real analytics will be connected when platform APIs are integrated
    const mockOverview = {
      workspaceId,
      period: "overall",
      metrics: {
        totalFollowers: 0,
        followersGrowth: {
          value: 0,
          percentage: 0,
          trend: "stable" as const,
        },
        totalEngagement: 0,
        engagementGrowth: {
          value: 0,
          percentage: 0,
          trend: "stable" as const,
        },
        totalImpressions: 0,
        impressionsGrowth: {
          value: 0,
          percentage: 0,
          trend: "stable" as const,
        },
        totalPosts: 0,
        postsGrowth: {
          value: 0,
          percentage: 0,
          trend: "stable" as const,
        },
      },
      platformBreakdown: [
        {
          platform: "instagram",
          followers: 0,
          engagement: 0,
          impressions: 0,
          posts: 0,
        },
        {
          platform: "tiktok",
          followers: 0,
          engagement: 0,
          impressions: 0,
          posts: 0,
        },
        {
          platform: "twitter",
          followers: 0,
          engagement: 0,
          impressions: 0,
          posts: 0,
        },
        {
          platform: "facebook",
          followers: 0,
          engagement: 0,
          impressions: 0,
          posts: 0,
        },
        {
          platform: "linkedin",
          followers: 0,
          engagement: 0,
          impressions: 0,
          posts: 0,
        },
        {
          platform: "youtube",
          followers: 0,
          engagement: 0,
          impressions: 0,
          posts: 0,
        },
      ],
      recentTrends: {
        daily: Array.from({ length: 7 }, (_, i) => ({
          date: new Date(
            Date.now() - (6 - i) * 24 * 60 * 60 * 1000
          ).toISOString().split("T")[0],
          followers: 0,
          engagement: 0,
          impressions: 0,
          posts: 0,
        })),
      },
    };

    return NextResponse.json(mockOverview);
  } catch (error) {
    console.error("Error fetching analytics overview:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
