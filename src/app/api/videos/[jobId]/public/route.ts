import { NextResponse } from "next/server";
import { db } from "@/db";
import { videoBatchJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { blobToken } from "@/lib/blob-token";

export const runtime = "nodejs";

/**
 * Public batch-video proxy — streams a finished job's video WITHOUT auth.
 *
 * Mirror of /api/media/[id]/public for batch/job videos that never became
 * media assets. The job UUID is the secret (unlisted, like the media proxy):
 * TikTok PULL_FROM_URL and IG container URLs need something their servers can
 * fetch, and private Blob URLs 403 without a Bearer token.
 *
 * GET /api/videos/[jobId]/public?kind=final|footage
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const kind = new URL(request.url).searchParams.get("kind") ?? "final";

    const [job] = await db
      .select()
      .from(videoBatchJobs)
      .where(eq(videoBatchJobs.id, jobId))
      .limit(1);

    if (!job) return new Response("Not found", { status: 404 });

    const url = kind === "footage" ? job.footageUrl : job.finalUrl;
    if (!url || url.startsWith("dryrun:")) {
      return new Response("No video for this job", { status: 404 });
    }

    if (url.includes("blob.vercel-storage.com")) {
      const token = blobToken();
      if (!token) return new Response("Blob token missing", { status: 500 });
      const upstreamHeaders: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      // Forward Range (video playback/seeking needs 206 partial content).
      const range = request.headers.get("range");
      if (range) upstreamHeaders["Range"] = range;
      const upstream = await fetch(url, { headers: upstreamHeaders });
      if (!upstream.ok && upstream.status !== 206) {
        return new Response("Upstream error", { status: 502 });
      }
      const respHeaders: Record<string, string> = {
        "Content-Type": upstream.headers.get("content-type") ?? "video/mp4",
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
      };
      const contentRange = upstream.headers.get("content-range");
      if (contentRange) respHeaders["Content-Range"] = contentRange;
      const contentLength = upstream.headers.get("content-length") ?? "";
      if (contentLength) respHeaders["Content-Length"] = contentLength;
      return new Response(upstream.body, {
        status: range ? 206 : 200,
        headers: respHeaders,
      });
    }

    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Error streaming public video:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
