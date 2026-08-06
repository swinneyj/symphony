import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { fetchTikTokCreatorInfo, getTikTokAccountForMember } from "@/lib/tiktok";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  try {
    const result = await getTikTokAccountForMember(workspaceId, session.user.id);
    if (!result.authorized) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!result.account) {
      return NextResponse.json({ error: "Connect TikTok first" }, { status: 409 });
    }

    const creator = await fetchTikTokCreatorInfo(result.account.accessToken);
    return NextResponse.json(creator);
  } catch (error) {
    console.error("TikTok creator info error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Creator lookup failed" },
      { status: 502 }
    );
  }
}
