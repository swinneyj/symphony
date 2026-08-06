import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { fetchTikTokPublishStatus, getTikTokAccountForMember } from "@/lib/tiktok";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId, publishId } = (await request.json()) as {
      workspaceId?: string;
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

    const status = await fetchTikTokPublishStatus(result.account.accessToken, publishId);
    return NextResponse.json(status);
  } catch (error) {
    console.error("TikTok status error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TikTok status lookup failed" },
      { status: 502 }
    );
  }
}
