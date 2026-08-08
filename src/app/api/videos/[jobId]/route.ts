import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { videoBatchJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { blobToken } from "@/lib/blob-token";

/**
 * GET /api/videos/[jobId]?kind=final|footage
 * Streams a finished batch job's video from Blob (private URLs need the
 * server-side token) so the Post Queue can preview + download it.
 * External URLs (non-Blob) redirect; dry-run markers 404.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { jobId } = await params;
    const kind = new URL(request.url).searchParams.get("kind") ?? "final";

    const [job] = await db
      .select()
      .from(videoBatchJobs)
      .where(eq(videoBatchJobs.id, jobId))
      .limit(1);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (!(await hasWorkspaceAccess(job.workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = kind === "footage" ? job.footageUrl : job.finalUrl;
    if (!url || url.startsWith("dryrun:")) {
      return NextResponse.json(
        { error: "No real video for this job (dry-run or unfinished)" },
        { status: 404 }
      );
    }

    // Blob storage → proxy with server token. Anything else → redirect.
    if (url.includes("blob.vercel-storage.com")) {
      const token = blobToken();
      if (!token) {
        return NextResponse.json({ error: "Blob token missing" }, { status: 500 });
      }
      const upstream = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!upstream.ok) {
        return NextResponse.json(
          { error: `Video fetch failed: ${upstream.status}` },
          { status: 502 }
        );
      }
      const disposition = kind === "footage" ? "inline" : "attachment";
      return new NextResponse(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": upstream.headers.get("content-type") ?? "video/mp4",
          "Content-Length": upstream.headers.get("content-length") ?? "",
          "Content-Disposition": `${disposition}; filename="${job.id}.mp4"`,
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Error streaming video:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
