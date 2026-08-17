import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { fetchTikTokPublishStatus, getTikTokAccountForMember } from "@/lib/tiktok";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId, accountId, publishId } = (await request.json()) as {
      workspaceId?: string;
      accountId?: string;
      publishId?: string;
    };
    if (!workspaceId || !publishId) {
      return NextResponse.json({ error: "workspaceId and publishId are required" }, { status: 400 });
    }

    const result = await getTikTokAccountForMember(workspaceId, session.user.id);
    if (!result.authorized) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!result.account) {
      return NextResponse.json({ error: "Connect TikTok first" }, { status: 409 });
    }

    let account = result.account;
    if (accountId) {
      const [requested] = await db
        .select()
        .from(socialAccounts)
        .where(
          and(
            eq(socialAccounts.workspaceId, workspaceId),
            eq(socialAccounts.platform, "tiktok"),
            eq(socialAccounts.id, accountId),
            eq(socialAccounts.status, "connected")
          )
        )
        .limit(1);
      if (!requested) {
        return NextResponse.json({ error: "TikTok account not found" }, { status: 404 });
      }
      account = requested;
    }

    const status = await fetchTikTokPublishStatus(account.accessToken, publishId);
    return NextResponse.json(status);
  } catch (error) {
    console.error("TikTok status error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TikTok status lookup failed" },
      { status: 502 }
    );
  }
}
