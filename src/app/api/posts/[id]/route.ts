import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  posts,
  postPlatformStatus,
  workspaceMembers,
  users,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const [post] = await db
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
      .where(eq(posts.id, id))
      .limit(1);

    if (!post) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Verify user is a member of the post's workspace
    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, post.workspaceId),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get platform statuses for this post
    const platformStatuses = await db
      .select()
      .from(postPlatformStatus)
      .where(eq(postPlatformStatus.postId, id));

    return NextResponse.json({
      ...post,
      platformStatuses,
    });
  } catch (error) {
    console.error("Error getting post:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Fetch the post first
    const [existingPost] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1);

    if (!existingPost) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Verify user is a member of the workspace
    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, existingPost.workspaceId),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Build update data from provided fields
    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      "content",
      "mediaIds",
      "platformConfigs",
      "status",
      "scheduledFor",
      "campaignId",
      "approvalStatus",
      "isTemplate",
    ] as const;

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Validate status if provided
    if (body.status !== undefined) {
      const validStatuses = [
        "draft",
        "scheduled",
        "approved",
        "published",
        "failed",
        "cancelled",
      ];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: "Invalid status value" },
          { status: 400 }
        );
      }
    }

    // Validate scheduledFor if provided
    if (body.scheduledFor !== undefined && body.scheduledFor !== null) {
      const date = new Date(body.scheduledFor);
      if (isNaN(date.getTime())) {
        return NextResponse.json(
          { error: "Invalid scheduledFor date" },
          { status: 400 }
        );
      }
      updateData.scheduledFor = date;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    updateData.updatedAt = new Date();

    const [updatedPost] = await db
      .update(posts)
      .set(updateData)
      .where(eq(posts.id, id))
      .returning();

    return NextResponse.json(updatedPost);
  } catch (error) {
    console.error("Error updating post:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const [existingPost] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1);

    if (!existingPost) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Verify user is a member of the workspace
    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, existingPost.workspaceId),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.delete(posts).where(eq(posts.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting post:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
