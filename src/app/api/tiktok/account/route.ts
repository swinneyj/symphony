import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
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

  const account = result.account
    ? {
        id: result.account.id,
        accountName: result.account.accountName,
        accountUsername: result.account.accountUsername,
        avatarUrl: result.account.avatarUrl,
        status: result.account.status,
        metadata: result.account.metadata,
        updatedAt: result.account.updatedAt,
      }
    : null;

  return NextResponse.json({
    environment: "Production",
    products: ["Login Kit", "Content Posting API"],
    scopes: TIKTOK_SCOPES,
    account,
  });
}
