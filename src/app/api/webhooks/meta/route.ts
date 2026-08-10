import { NextResponse } from "next/server";
import { db } from "@/db";
import { inboxMessages, socialAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Meta Graph API Webhooks receiver.
 *
 * GET  — verification handshake (hub.mode=subscribe&hub.verify_token=...)
 * POST — comment/message events. Dev-mode apps deliver only for accounts
 *        that granted access to the app; production delivery for all users
 *        requires Meta app review.
 *
 * Verify token: META_WEBHOOK_VERIFY_TOKEN env.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "Webhook verify token not configured" }, { status: 500 });
  }
  if (mode === "subscribe" && token === expected && challenge) {
    return new NextResponse(challenge);
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(request: Request) {
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  // HMAC signature check (X-Hub-Signature-256 = sha256=hex of app secret)
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const appSecret = process.env.META_CLIENT_SECRET;
  if (appSecret) {
    const raw = await request.clone().text();
    const crypto = await import("crypto");
    const expectedSig = `sha256=${crypto.createHmac("sha256", appSecret).update(raw).digest("hex")}`;
    if (signature !== expectedSig) {
      return NextResponse.json({ error: "Bad signature" }, { status: 403 });
    }
  }

  const body = await request.json().catch(() => null);
  if (!body?.entry) {
    return NextResponse.json({ ok: true }); // echo/other events — ack
  }

  let inserted = 0;
  for (const entry of body.entry as Array<Record<string, unknown>>) {
    const pageId = String(entry.id ?? "");
    if (!pageId) continue;

    // Find the connected FB page (or IG account whose page this is)
    const account = await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.platform, "facebook"),
          eq(socialAccounts.platformAccountId, pageId),
          eq(socialAccounts.status, "connected")
        )
      )
      .limit(1);

    // Comments on page posts
    const comments = (entry.comments ?? []) as Array<Record<string, unknown>>;
    for (const c of comments) {
      const commentId = String(c.id ?? "");
      const text = String(
        ((c.message ?? c.comment ?? {}) as Record<string, unknown>).message ?? ""
      );
      if (!commentId || !text) continue;
      const from = (c.from ?? {}) as Record<string, unknown>;

      const existing = await db
        .select({ id: inboxMessages.id })
        .from(inboxMessages)
        .where(eq(inboxMessages.platformMessageId, commentId))
        .limit(1);
      if (existing.length > 0) continue;

      if (account.length > 0) {
        await db.insert(inboxMessages).values({
          workspaceId: account[0].workspaceId,
          socialAccountId: account[0].id,
          platform: "facebook",
          platformMessageId: commentId,
          messageType: "comment",
          status: "unread",
          senderId: String(from.id ?? "") || null,
          senderName: String(from.name ?? "Unknown"),
          senderUsername: String(from.name ?? "Unknown"),
          content: text,
          metadata: { pageId, postId: entry.post_id ?? null },
        });
        inserted++;
      }
    }
  }

  return NextResponse.json({ ok: true, inserted });
}
