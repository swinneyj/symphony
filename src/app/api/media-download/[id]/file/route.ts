import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { mediaDownloads } from "@/db/schema";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { blobToken } from "@/lib/blob-token";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/media-download/[id]/file?kind=video|audio
 * Streams the downloaded file from private Blob (session-gated, unlike the
 * unlisted public proxy — downloads stay within the workspace).
 */
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
    const kind = new URL(request.url).searchParams.get("kind") ?? "video";
    const token = blobToken();
    if (!token) return NextResponse.json({ error: "Blob token missing" }, { status: 500 });

    const [row] = await db
      .select({ workspaceId: mediaDownloads.workspaceId, videoUrl: mediaDownloads.videoUrl, audioUrl: mediaDownloads.audioUrl })
      .from(mediaDownloads)
      .where(eq(mediaDownloads.id, id))
      .limit(1);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await hasWorkspaceAccess(row.workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = kind === "audio" ? row.audioUrl : row.videoUrl;
    if (!url) return NextResponse.json({ error: "Not ready" }, { status: 404 });

    const upstream = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!upstream.ok) return NextResponse.json({ error: "Upstream error" }, { status: 502 });

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": kind === "audio" ? "audio/mpeg" : "video/mp4",
        "Content-Length": upstream.headers.get("content-length") ?? "",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error streaming media download:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
