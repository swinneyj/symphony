import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { posts, workspaceMembers, users } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const status = searchParams.get("status");
    const campaignId = searchParams.get("campaignId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = (page - 1) * limit;

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

    // Build filters
    const filters = [eq(posts.workspaceId, workspaceId)];
    if (status) {
      const validStatuses = [
        "draft",
        "scheduled",
        "approved",
        "published",
        "failed",
        "cancelled",
      ];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: "Invalid status value" },
          { status: 400 }
        );
      }
      filters.push(eq(posts.status, status as typeof posts.$inferSelect.status));
    }
    if (campaignId) {
      filters.push(eq(posts.campaignId, campaignId));
    }

    // Get total count for pagination
    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(posts)
      .where(and(...filters));

    const total = Number(countResult.count);

    // Fetch posts with creator info
    const postsList = await db
      .select({
        id: posts.id,
        workspaceId: posts.workspaceId,
        createdById: posts.createdById,
        content: posts.content,
        mediaIds: posts.mediaIds,
        platformConfigs: posts.platformConfigs,
        status: posts.status,
        scheduledFor: posts.scheduledFor,
        publishedAt: posts.publishedAt,
        failureReason: posts.failureReason,
        campaignId: posts.campaignId,
        approvalStatus: posts.approvalStatus,
        isTemplate: posts.isTemplate,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
        createdByName: users.name,
        createdByImage: users.image,
      })
      .from(posts)
      .leftJoin(users, eq(posts.createdById, users.id))
      .where(and(...filters))
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      posts: postsList,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error listing posts:", error);
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
    const { workspaceId, content, mediaIds, platformConfigs, status, scheduledFor, campaignId, isTemplate } = body;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
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

    const validStatuses = [
      "draft",
      "scheduled",
      "approved",
      "published",
      "failed",
      "cancelled",
    ] as const;
    const postStatus = status || "draft";
    if (!validStatuses.includes(postStatus as (typeof validStatuses)[number])) {
      return NextResponse.json(
        { error: "Invalid status value" },
        { status: 400 }
      );
    }

    // Validate scheduledFor if status is scheduled
    let scheduledForDate: Date | null = null;
    if (scheduledFor) {
      scheduledForDate = new Date(scheduledFor);
      if (isNaN(scheduledForDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid scheduledFor date" },
          { status: 400 }
        );
      }
    }

    const [post] = await db
      .insert(posts)
      .values({
        workspaceId,
        createdById: session.user.id,
        content: content || null,
        mediaIds: mediaIds || [],
        platformConfigs: platformConfigs || {},
        status: postStatus as typeof posts.$inferSelect.status,
        scheduledFor: scheduledForDate,
        campaignId: campaignId || null,
        isTemplate: isTemplate || false,
      })
      .returning();

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    console.error("Error creating post:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
