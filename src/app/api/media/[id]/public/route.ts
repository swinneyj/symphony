import { NextResponse } from "next/server";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { blobToken } from "@/lib/blob-token";

export const runtime = "nodejs";

/**
 * Public media proxy — streams a workspace media asset WITHOUT auth.
 *
 * The asset UUID is the secret (unlisted, like the /f/<id> formula pages):
 * IG containers and TikTok PULL_FROM_URL need a URL their servers can fetch,
 * and private Blob URLs 403 without a Bearer token. Anything you can't
 * share, don't upload here.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id))
    .limit(1);

  if (!asset) return new Response("Not found", { status: 404 });

  if (asset.url.startsWith("https://") && asset.url.includes("blob.vercel-storage.com")) {
    const token = blobToken();
    if (!token) return new Response("Blob token missing", { status: 500 });
    const upstreamHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
    // Forward Range (video playback/seeking needs 206 partial content).
    const range = request.headers.get("range");
    if (range) upstreamHeaders["Range"] = range;
    const upstream = await fetch(asset.url, { headers: upstreamHeaders });
    if (!upstream.ok && upstream.status !== 206) return new Response("Upstream error", { status: 502 });
    const respHeaders: Record<string, string> = {
      "Content-Type": asset.mimeType ?? "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
    };
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) respHeaders["Content-Range"] = contentRange;
    const contentLength = upstream.headers.get("content-length") ?? String(asset.fileSize ?? "");
    if (contentLength) respHeaders["Content-Length"] = contentLength;
    return new Response(upstream.body, {
      status: range ? 206 : 200,
      headers: respHeaders,
    });
  }

  return NextResponse.redirect(asset.url);
}
