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
    const isTikTok = parsed.hostname.includes("tiktok.com");
    let platform =
      body?.platform === "upload"
        ? "upload"
        : isTikTok
          ? "tiktok"
          : "web";

    // Product-link detection: TikTok share links (/t/<id>, vm.tiktok.com)
    // can 301 to a Shop PRODUCT page (/view/product/<pid>) instead of a
    // video. Those have no video to download — resolve product info now and
    // let the remix engine write scripts from product facts (status fetched).
    const UA =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    let sourceUrl = parsed.toString();
    let title: string | null = null;
    let rawText: string | null = null;
    let status = "queued";

    if (isTikTok && platform !== "upload" && /\/t\/|\/view\/product\//.test(parsed.pathname)) {
      try {
        const redir = await fetch(sourceUrl, {
          redirect: "manual",
          headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
          signal: AbortSignal.timeout(10_000),
        });
        const location = redir.headers.get("location") ?? "";
        const productMatch =
          location.match(/\/view\/product\/(\d+)/) ??
          parsed.pathname.match(/\/view\/product\/(\d+)/);
        if (productMatch) {
          const productId = productMatch[1];
          sourceUrl = `https://www.tiktok.com/view/product/${productId}`;
          // The 301 Location leaks og_info (title + image) — free metadata.
          const ogInfo = (() => {
            const m = location.match(/og_info=([^&]+)/);
            if (!m) return {} as { title?: string; image?: string };
            try {
              const parsed = JSON.parse(decodeURIComponent(m[1])) as {
                title?: string;
                image?: string;
              };
              // og_info is form-encoded: "+" means space.
              return {
                title: parsed.title?.replace(/\+/g, " "),
                image: parsed.image?.replace(/\+/g, " "),
              };
            } catch {
              return {} as { title?: string; image?: string };
            }
          })();
          // Try to enrich with og:title/description/image from the product
          // page (datacenter IPs usually get it; fall back to redirect info).
          let name = ogInfo.title ?? "";
          let description = "";
          let image = ogInfo.image ?? "";
          try {
            const page = await fetch(sourceUrl, {
              headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
              signal: AbortSignal.timeout(15_000),
            });
            const html = await page.text();
            const ogTag = (name: string) =>
              html.match(
                new RegExp(
                  `<meta[^>]+(?:property|name)="og:${name}"[^>]+content="([^"]*)"`,
                  "i"
                )
              )?.[1] ??
              html.match(
                new RegExp(
                  `<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="og:${name}"`,
                  "i"
                )
              )?.[1] ??
              "";
            name = ogTag("title") || name;
            description = ogTag("description");
            image = ogTag("image") || image;
          } catch {
            // product page optional — redirect og_info already gives us title+image
          }
          const cleanName = (name || "TikTok Shop product").trim();
          title = cleanName.slice(0, 300);
          rawText = [
            `Product: ${cleanName}`,
            description && `Description: ${description}`,
            image && `Product image: ${image}`,
          ]
            .filter(Boolean)
            .join("\n\n")
            .slice(0, 4000);
          status = "fetched";
          platform = "product";
        }
      } catch {
        // resolution failure → fall through to the normal worker path
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
