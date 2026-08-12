import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { getTikTokAccountForMember, TIKTOK_SCOPES } from "@/lib/tiktok";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const result = await getTikTokAccountForMember(workspaceId, session.user.id);
  if (!result.authorized) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Every connected TikTok account for this workspace (multi-account).
  const rows = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.workspaceId, workspaceId),
        eq(socialAccounts.platform, "tiktok"),
        eq(socialAccounts.status, "connected")
      )
    )
    .orderBy(socialAccounts.createdAt);

  const accounts = rows.map((account) => ({
    id: account.id,
    accountName: account.accountName,
    accountUsername: account.accountUsername,
    avatarUrl: account.avatarUrl,
    status: account.status,
    metadata: account.metadata,
    updatedAt: account.updatedAt,
  }));

  return NextResponse.json({
    environment: "Production",
    products: ["Login Kit", "Content Posting API"],
    scopes: TIKTOK_SCOPES,
    accounts,
  });
}
