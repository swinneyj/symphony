import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { videoBatchJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { blobToken } from "@/lib/blob-token";

export const runtime = "nodejs";

/**
 * GET /api/image-studio/jobs/[jobId]/asset?kind=scene|footage|final
 * Streams a generated Image Studio asset (scene image / footage / final video)
 * from PRIVATE Blob storage — a browser <img>/<video> can't fetch those URLs
 * directly (403 without a Bearer token). Mirrors /api/products/[id]/image.
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
    const kind = new URL(request.url).searchParams.get("kind") ?? "scene";

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

    if (url.includes("blob.vercel-storage.com")) {
      const token = blobToken();
      if (!token) return new Response("Blob token missing", { status: 500 });
      const upstream = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!upstream.ok) return new Response("Upstream error", { status: 502 });
      const contentType =
        upstream.headers.get("content-type") ??
        (kind === "scene" ? "image/png" : "video/mp4");
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // Public URL (fal.media etc.) — redirect is fine.
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Error streaming image-studio asset:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
