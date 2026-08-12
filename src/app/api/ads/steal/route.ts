import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { adSources, adRemixes } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

/**
 * Steal This Ad
 *
 * POST /api/ads/steal — { workspaceId, url } — enqueue a viral ad for
 *   fetch + transcription (the ads-worker picks it up: yt-dlp + whisper).
 * GET  /api/ads/steal?workspaceId=… — list sources w/ remix counts.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const url = typeof body?.url === "string" ? body.url : "";
    const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
    if (!url || !workspaceId) {
      return NextResponse.json(
        { error: "url and workspaceId are required" },
        { status: 400 }
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(url.trim());
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("bad protocol");
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // "upload" = the URL is a private Blob URL from /api/media/upload (the
    // user dropped the ad file in directly — TikTok blocks datacenter IPs).
    const platform =
      body?.platform === "upload"
        ? "upload"
        : parsed.hostname.includes("tiktok.com")
          ? "tiktok"
          : "web";
    const [row] = await db
      .insert(adSources)
      .values({
        workspaceId,
        createdById: session.user.id,
        sourceUrl: parsed.toString(),
        platform,
      })
      .returning();

    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error("Error enqueueing ad source:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sources = await db
      .select({
        id: adSources.id,
        sourceUrl: adSources.sourceUrl,
        platform: adSources.platform,
        title: adSources.title,
        authorName: adSources.authorName,
        status: adSources.status,
        error: adSources.error,
        createdAt: adSources.createdAt,
        remixCount: sql<number>`(SELECT count(*) FROM ${adRemixes} WHERE ${adRemixes.adSourceId} = ${adSources.id})`,
      })
      .from(adSources)
      .where(eq(adSources.workspaceId, workspaceId))
      .orderBy(desc(adSources.createdAt))
      .limit(50);

    return NextResponse.json(sources);
  } catch (error) {
    console.error("Error listing ad sources:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
