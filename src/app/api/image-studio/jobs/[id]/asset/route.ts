import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { videoBatchJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { blobToken } from "@/lib/blob-token";
import { issueSignedToken, presignUrl } from "@vercel/blob";

export const runtime = "nodejs";

/**
 * GET /api/image-studio/jobs/[jobId]/asset?kind=scene|footage|final[&download=1]
 * Streams a generated Image Studio asset (scene image / footage / final video)
 * from PRIVATE Blob storage — a browser <img>/<video> can't fetch those URLs
 * directly (403 without a Bearer token). Mirrors /api/products/[id]/image.
 *
 * ?download=1 → presign a short-lived CDN URL (issueSignedToken + presignUrl)
 * and redirect; the browser downloads straight from the Blob CDN instead of
 * streaming through this serverless function (much faster for videos).
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
    const search = new URL(request.url).searchParams;
    const kind = search.get("kind") ?? "scene";
    const download = search.get("download") === "1";

    const [job] = await db
      .select({
        id: videoBatchJobs.id,
        workspaceId: videoBatchJobs.workspaceId,
        sceneImageUrl: videoBatchJobs.sceneImageUrl,
        footageUrl: videoBatchJobs.footageUrl,
        finalUrl: videoBatchJobs.finalUrl,
      })
      .from(videoBatchJobs)
      .where(eq(videoBatchJobs.id, id))
      .limit(1);

    if (!job) return new Response("Job not found", { status: 404 });
    if (!(await hasWorkspaceAccess(job.workspaceId, session.user.id))) {
      return new Response("Forbidden", { status: 403 });
    }

    const url =
      kind === "footage"
        ? job.footageUrl
        : kind === "final"
          ? job.finalUrl
          : job.sceneImageUrl;
    if (!url) return new Response("No asset", { status: 404 });

    // Fast download path: presign a direct CDN URL so the browser fetches at
    // full speed (no serverless relay). Token expiry ~15 min, read-only.
    if (download && url.includes("blob.vercel-storage.com")) {
      try {
        const token = blobToken();
        if (!token) return new Response("Blob token missing", { status: 500 });
        const pathname = new URL(url).pathname;
        const signed = await issueSignedToken({
          token,
          pathname,
          operations: ["get"],
          validUntil: Date.now() + 15 * 60 * 1000,
        });
        const { presignedUrl } = await presignUrl(
          { clientSigningToken: signed.clientSigningToken, delegationToken: signed.delegationToken },
          { operation: "get", pathname, access: "private" }
        );
        return NextResponse.redirect(`${presignedUrl}&download=1`);
      } catch (presignError) {
        // Fall back to serverless streaming if presigning fails.
        console.warn(`[image-studio] presign failed, streaming instead: ${(presignError as Error).message}`);
      }
    }

    if (url.includes("blob.vercel-storage.com")) {
      const token = blobToken();
      if (!token) return new Response("Blob token missing", { status: 500 });
      const upstreamHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
      // Forward the browser's Range request (video seeking/playback needs
      // 206 partial-content responses — without this <video> shows black).
      const range = request.headers.get("range");
      if (range) upstreamHeaders["Range"] = range;
      const upstream = await fetch(url, { headers: upstreamHeaders });
      if (!upstream.ok && upstream.status !== 206) {
        return new Response("Upstream error", { status: 502 });
      }
      const contentType =
        upstream.headers.get("content-type") ??
        (kind === "scene" ? "image/png" : "video/mp4");
      const respHeaders: Record<string, string> = {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      };
      const contentRange = upstream.headers.get("content-range");
      if (contentRange) respHeaders["Content-Range"] = contentRange;
      if (range) respHeaders["Content-Length"] = upstream.headers.get("content-length") ?? "";
      if (download) {
        respHeaders["Content-Disposition"] = `attachment; filename="image-studio-${kind}-${id}.${kind === "scene" ? "png" : "mp4"}"`;
      }
      return new Response(upstream.body, {
        status: range ? 206 : 200,
        headers: respHeaders,
      });
    }

    // Public URL (fal.media etc.) — redirect is fine.
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Error streaming image-studio asset:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
