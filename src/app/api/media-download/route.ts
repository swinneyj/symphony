import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { mediaDownloads } from "@/db/schema";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { eq, desc, and } from "drizzle-orm";

export const runtime = "nodejs";

function detectPlatform(url: string): string {
  if (url.includes("tiktok.com")) return "tiktok";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("instagram.com")) return "instagram";
  return "other";
}

/** POST /api/media-download — queue a link for the ads-worker. */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspaceId, sourceUrl, wantAudio } = (await request.json()) as {
      workspaceId?: string;
      sourceUrl?: string;
      wantAudio?: boolean;
    };
    if (!workspaceId || !sourceUrl?.trim()) {
      return NextResponse.json({ error: "workspaceId and sourceUrl are required" }, { status: 400 });
    }
    if (!/^https?:\/\//.test(sourceUrl.trim())) {
      return NextResponse.json({ error: "sourceUrl must be an http(s) link" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [row] = await db
      .insert(mediaDownloads)
      .values({
        workspaceId,
        createdById: session.user.id,
        sourceUrl: sourceUrl.trim(),
        platform: detectPlatform(sourceUrl),
        wantAudio: Boolean(wantAudio),
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error("Error creating media download:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/** GET /api/media-download?workspaceId= — recent downloads for the tab. */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = new URL(request.url).searchParams.get("workspaceId") ?? "";
    if (!workspaceId || !(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const rows = await db
      .select()
      .from(mediaDownloads)
      .where(and(eq(mediaDownloads.workspaceId, workspaceId)))
      .orderBy(desc(mediaDownloads.createdAt))
      .limit(30);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Error listing media downloads:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
