import { NextResponse } from "next/server";
import { db } from "@/db";
import { inboxMessages, socialAccounts } from "@/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { fetchYouTubeComments } from "@/lib/youtube";

/**
 * GET /api/cron/inbox-youtube — YouTube comment ingestion tick.
 *
 * For every connected YouTube channel, pulls recent comments on recent
 * uploads (Data API v3 commentThreads, free quota) and inserts new ones
 * into inbox_messages (deduped by platform_message_id). Runs on a daily
 * cron; no auth beyond the CRON_SECRET guard.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (secret && bearer !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const channels = await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.platform, "youtube"),
          eq(socialAccounts.status, "connected"),
          isNotNull(socialAccounts.accessToken)
        )
      );

    let synced = 0;
    const failed: string[] = [];

    for (const channel of channels) {
      try {
        const comments = await fetchYouTubeComments(channel.accessToken, 25);
        let inserted = 0;
        for (const c of comments) {
          // Dedupe by platform message id
          const existing = await db
            .select({ id: inboxMessages.id })
            .from(inboxMessages)
            .where(eq(inboxMessages.platformMessageId, c.commentId))
            .limit(1);
          if (existing.length > 0) continue;

          await db.insert(inboxMessages).values({
            workspaceId: channel.workspaceId,
            socialAccountId: channel.id,
            platform: "youtube",
            platformMessageId: c.commentId,
            messageType: "comment",
            status: "unread",
            senderId: c.authorChannelId ?? null,
            senderName: c.author,
            senderUsername: c.author,
            content: c.text,
            receivedAt: new Date(c.publishedAt || Date.now()),
            metadata: { videoId: c.videoId, likeCount: c.likeCount },
          });
          inserted++;
        }
        synced += inserted;
      } catch (e) {
        failed.push(
          `${channel.accountName}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    return NextResponse.json({ ok: true, synced, failed });
  } catch (error) {
    console.error("inbox-youtube cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
