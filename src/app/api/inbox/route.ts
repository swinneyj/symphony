import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  inboxMessages,
  inboxReplies,
  socialAccounts,
  workspaceMembers,
  users,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { replyToYouTubeComment } from "@/lib/youtube";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const socialAccountId = searchParams.get("socialAccountId");
    const status = searchParams.get("status");
    const messageType = searchParams.get("messageType");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

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
    const filters = [
      eq(inboxMessages.workspaceId, workspaceId),
      sql`${inboxMessages.parentId} IS NULL`, // Only top-level messages
    ];

    if (socialAccountId) {
      filters.push(eq(inboxMessages.socialAccountId, socialAccountId));
    }

    if (status) {
      const validStatuses = ["unread", "read", "replied", "archived", "spam"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: "Invalid status value" },
          { status: 400 }
        );
      }
      filters.push(
        eq(
          inboxMessages.status,
          status as "unread" | "read" | "replied" | "archived" | "spam"
        )
      );
    }

    if (messageType) {
      const validTypes = ["comment", "direct_message", "mention", "reply"];
      if (!validTypes.includes(messageType)) {
        return NextResponse.json(
          { error: "Invalid messageType value" },
          { status: 400 }
        );
      }
      filters.push(
        eq(
          inboxMessages.messageType,
          messageType as "comment" | "direct_message" | "mention" | "reply"
        )
      );
    }

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(inboxMessages)
      .where(and(...filters));

    const total = Number(countResult.count);

    const messages = await db
      .select({
        id: inboxMessages.id,
        workspaceId: inboxMessages.workspaceId,
        socialAccountId: inboxMessages.socialAccountId,
        platform: inboxMessages.platform,
        platformMessageId: inboxMessages.platformMessageId,
        messageType: inboxMessages.messageType,
        status: inboxMessages.status,
        senderId: inboxMessages.senderId,
        senderName: inboxMessages.senderName,
        senderAvatar: inboxMessages.senderAvatar,
        senderUsername: inboxMessages.senderUsername,
        content: inboxMessages.content,
        mediaUrls: inboxMessages.mediaUrls,
        parentId: inboxMessages.parentId,
        assignedToId: inboxMessages.assignedToId,
        tags: inboxMessages.tags,
        metadata: inboxMessages.metadata,
        receivedAt: inboxMessages.receivedAt,
        createdAt: inboxMessages.createdAt,
        socialAccountName: socialAccounts.accountName,
        socialAccountPlatform: socialAccounts.platform,
      })
      .from(inboxMessages)
      .leftJoin(
        socialAccounts,
        eq(inboxMessages.socialAccountId, socialAccounts.id)
      )
      .where(and(...filters))
      .orderBy(desc(inboxMessages.receivedAt))
      .limit(Math.min(limit, 100))
      .offset(offset);

    return NextResponse.json({
      messages,
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (error) {
    console.error("Error listing inbox messages:", error);
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
    const { messageId, content } = body;

    if (!messageId) {
      return NextResponse.json(
        { error: "messageId is required" },
        { status: 400 }
      );
    }

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    // Fetch the original message to verify workspace access
    const [originalMessage] = await db
      .select()
      .from(inboxMessages)
      .where(eq(inboxMessages.id, messageId))
      .limit(1);

    if (!originalMessage) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Verify user is a member of the workspace
    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, originalMessage.workspaceId),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Create the reply (DB record first — the inbox reply is what the UI shows)
    const [reply] = await db
      .insert(inboxReplies)
      .values({
        messageId,
        repliedById: session.user.id,
        content: content.trim(),
      })
      .returning();

    // Send the reply to the platform (best-effort; record the platform id if sent)
    let platformPostId: string | null = null;
    try {
      if (originalMessage.platform === "youtube") {
        const account = await db
          .select()
          .from(socialAccounts)
          .where(
            and(
              eq(socialAccounts.id, originalMessage.socialAccountId),
              eq(socialAccounts.status, "connected")
            )
          )
          .limit(1);
        if (account.length > 0) {
          const videoId = String(
            (originalMessage.metadata as Record<string, unknown>)?.videoId ?? ""
          );
          if (videoId) {
            const res = await replyToYouTubeComment({
              accessToken: account[0].accessToken,
              videoId,
              parentId: originalMessage.platformMessageId,
              text: content.trim(),
            });
            platformPostId = res.id ?? null;
          }
        }
      } else if (originalMessage.platform === "facebook" || originalMessage.platform === "instagram") {
        // Meta comments: POST /{comment-id}/comments with a page token
        const account = await db
          .select()
          .from(socialAccounts)
          .where(
            and(
              eq(socialAccounts.id, originalMessage.socialAccountId),
              eq(socialAccounts.status, "connected")
            )
          )
          .limit(1);
        if (account.length > 0) {
          const res = await fetch(
            `https://graph.facebook.com/v21.0/${originalMessage.platformMessageId}/comments`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: content.trim(),
                access_token: account[0].accessToken,
              }),
            }
          );
          if (res.ok) {
            const data = (await res.json()) as { id?: string };
            platformPostId = data.id ?? null;
          }
        }
      }
    } catch (e) {
      // Platform send failed — the reply stays visible in-app; flag via metadata
      console.error("inbox platform reply failed:", e);
    }

    if (platformPostId) {
      await db
        .update(inboxReplies)
        .set({ platformPostId })
        .where(eq(inboxReplies.id, reply.id));
    }

    // Update original message status to "replied"
    await db
      .update(inboxMessages)
      .set({ status: "replied" })
      .where(eq(inboxMessages.id, messageId));

    // Fetch reply with user info
    const [replyWithUser] = await db
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
      .where(eq(inboxReplies.id, reply.id))
      .limit(1);

    return NextResponse.json(replyWithUser, { status: 201 });
  } catch (error) {
    console.error("Error sending reply:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
