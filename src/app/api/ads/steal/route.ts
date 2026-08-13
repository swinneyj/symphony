import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { adSources, adRemixes } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { findProductMainVideo, resolveProductLink } from "@/lib/ads/product-link";

// Product-link resolution does a few bounded external fetches (redirect,
// product page, shop API) — allow up to a minute.
export const maxDuration = 60;

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
    const isTikTok = parsed.hostname.includes("tiktok.com");
    let platform =
      body?.platform === "upload"
        ? "upload"
        : isTikTok
          ? "tiktok"
          : "web";

    // Product-link detection: TikTok share links (/t/<id>, vm.tiktok.com)
    // can 301 to a Shop PRODUCT page (/view/product/<pid>) instead of a
    // video. Resolve the product brief now; if the connected Shop account
    // exposes the product's MAIN VIDEO, queue it for the worker (CDN
    // download + transcription) so remixes combine facts + shop-video VO.
    // Otherwise store brief-only (status fetched) — remix from facts alone.
    let sourceUrl = parsed.toString();
    let title: string | null = null;
    let rawText: string | null = null;
    let videoUrl: string | null = null;
    let status = "queued";

    if (isTikTok && platform !== "upload") {
      const product = await resolveProductLink(sourceUrl).catch(() => null);
      if (product) {
        sourceUrl = product.sourceUrl;
        title = product.title;
        rawText = product.brief;
        platform = "product";
        const mainVideo = await findProductMainVideo(
          workspaceId,
          product.productId,
          product.title
        ).catch(() => null);
        if (mainVideo) {
          videoUrl = mainVideo;
          rawText = null; // worker fills raw_text with the shop video transcript
          status = "queued";
        } else {
          status = "fetched";
        }
      }
    }

    const [row] = await db
      .insert(adSources)
      .values({
        workspaceId,
        createdById: session.user.id,
        sourceUrl,
        platform,
        title,
        rawText,
        videoUrl,
        status,
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
