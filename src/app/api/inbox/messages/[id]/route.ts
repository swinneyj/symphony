import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { inboxMessages, inboxReplies, workspaceMembers, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

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

    const [message] = await db
      .select()
      .from(inboxMessages)
      .where(eq(inboxMessages.id, id))
      .limit(1);

    if (!message) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Verify user is a member of the workspace
    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, message.workspaceId),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get replies for this message
    const replies = await db
      .select({
        id: inboxReplies.id,
        messageId: inboxReplies.messageId,
        repliedById: inboxReplies.repliedById,
        content: inboxReplies.content,
        platformPostId: inboxReplies.platformPostId,
        sentAt: inboxReplies.sentAt,
        repliedByName: users.name,
        repliedByImage: users.image,
      })
      .from(inboxReplies)
      .leftJoin(users, eq(inboxReplies.repliedById, users.id))
      .where(eq(inboxReplies.messageId, id))
      .orderBy(desc(inboxReplies.sentAt));

    return NextResponse.json({
      ...message,
      replies,
    });
  } catch (error) {
    console.error("Error getting message:", error);
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
    const { status, assignedToId, tags } = body;

    // Fetch the message to verify access
    const [message] = await db
      .select()
      .from(inboxMessages)
      .where(eq(inboxMessages.id, id))
      .limit(1);

    if (!message) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Verify user is a member of the workspace
    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, message.workspaceId),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (status !== undefined) {
      const validStatuses = ["unread", "read", "replied", "archived", "spam"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: "Invalid status value" },
          { status: 400 }
        );
      }
      updateData.status = status;
    }

    if (assignedToId !== undefined) {
      // If assigning to a user, verify the user exists
      if (assignedToId !== null) {
        const assignedUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, assignedToId))
          .limit(1);

        if (assignedUsers.length === 0) {
          return NextResponse.json(
            { error: "Assigned user not found" },
            { status: 404 }
          );
        }
      }
      updateData.assignedToId = assignedToId;
    }

    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        return NextResponse.json(
          { error: "Tags must be an array of strings" },
          { status: 400 }
        );
      }
      updateData.tags = tags;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(inboxMessages)
      .set(updateData)
      .where(eq(inboxMessages.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating message:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
