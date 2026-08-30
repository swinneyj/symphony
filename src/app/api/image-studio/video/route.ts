import { NextResponse } from "next/server";
import { flagJobs } from "@/lib/market/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { videoBatches, videoBatchJobs } from "@/db/schema";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/image-studio/video — Image Studio → Kling video generation.
 *
 * Body (JSON): workspaceId, imageUrl (approved scene image), videoType
 * ("01" | "03" — Kling 1.0 standard / Kling 3.0 pro), quality ("720p"|"1080p"),
 * aspectRatio ("9:16"|"16:9"|"1:1"|"4:5"), outputCount (1-4), durationSec
 * (3-10), prompt (optional motion prompt).
 *
 * Creates one `kling` batch + N `footage` jobs (N = outputCount, one seed per
 * output for variation). The worker animates the approved image → Kling
 * image-to-video → private Blob. Poll GET /api/batches/[batchId] for
 * footageUrl per job. Assembly (reverse loop + text burn) is a SEPARATE step
 * (/api/image-studio/assemble) after the user approves a video.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const workspaceId = (body.workspaceId as string) ?? "";
    const imageUrl = (body.imageUrl as string) ?? "";
    const videoType = (body.videoType as string) ?? "03";
    const quality = (body.quality as string) ?? "720p";
    const aspectRatio = (body.aspectRatio as string) ?? "9:16";
    const outputCount = Math.min(Math.max(Number(body.outputCount) || 1, 1), 4);
    const durationSec = Math.min(Math.max(Number(body.durationSec) || 5, 3), 10);
    const prompt = (body.prompt as string) ?? "";

    if (!workspaceId || !imageUrl) {
      return NextResponse.json({ error: "workspaceId and imageUrl are required" }, { status: 400 });
    }
    if (!["01", "03"].includes(videoType)) {
      return NextResponse.json({ error: "videoType must be 01 or 03" }, { status: 400 });
    }
    if (!["720p", "1080p"].includes(quality)) {
      return NextResponse.json({ error: "quality must be 720p or 1080p" }, { status: 400 });
    }
    if (!/^(9:16|16:9|1:1|4:5|3:4)$/.test(aspectRatio)) {
      return NextResponse.json({ error: "invalid aspectRatio" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [batch] = await db
      .insert(videoBatches)
      .values({
        workspaceId,
        createdById: session.user.id,
        name: `Kling Video: ${imageUrl.slice(0, 40)}`,
        quality: quality === "1080p" ? "pro" : "standard",
        provider: "kling",
        status: "queued",
        totalCount: outputCount,
      })
      .returning();

    for (let i = 0; i < outputCount; i++) {
      await db.insert(videoBatchJobs).values({
        batchId: batch.id,
        workspaceId,
        productId: null,
        formulaId: null,
        jobType: "footage",
        status: "queued",
        metadata: {
          sceneImageUrl: imageUrl,
          videoEngine: videoType === "01" ? "kling_v1" : "kling_v3",
          resolution: quality,
          aspectRatio,
          durationSec,
          seed: Date.now() % 1_000_000 + i, // variation across outputs
          noChain: true,
          imageStudio: true,
          ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
        },
      });
    }
    await Promise.all([flagJobs("video"), flagJobs("img")]);

    return NextResponse.json({ batchId: batch.id, jobCount: outputCount }, { status: 201 });
  } catch (error) {
    console.error("Error creating image-studio video batch:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
