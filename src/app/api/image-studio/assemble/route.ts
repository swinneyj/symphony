import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { videoBatches, videoBatchJobs } from "@/db/schema";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/image-studio/assemble — Image Studio final assembly.
 *
 * Body (JSON): workspaceId, footageUrl (approved Kling clip), reverse
 * (boolean — duplicate + play backward, 2× length), overlayBlocks (string[]),
 * overlayLayout (OverlayBox[] — per-line x/y/colors/font/treatment from the
 * CapCut-style editor), overlayFontSize (px).
 *
 * Creates a single `batch_video` job: reverse-extend (if requested) + ffmpeg
 * drawtext text burn + 9:16 encode → private Blob → finalUrl. $0 (ffmpeg).
 * Poll GET /api/batches/[batchId] for finalUrl.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const workspaceId = (body.workspaceId as string) ?? "";
    const footageUrl = (body.footageUrl as string) ?? "";
    const reverse = Boolean(body.reverse);
    const overlayBlocks = Array.isArray(body.overlayBlocks)
      ? (body.overlayBlocks as string[]).map(String).filter((l) => l.trim().length > 0)
      : [];
    const overlayLayout = Array.isArray(body.overlayLayout) ? body.overlayLayout : null;
    const overlayFontSize = Number(body.overlayFontSize) || 72;

    if (!workspaceId || !footageUrl) {
      return NextResponse.json({ error: "workspaceId and footageUrl are required" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [batch] = await db
      .insert(videoBatches)
      .values({
        workspaceId,
        createdById: session.user.id,
        name: `Image Studio Final${reverse ? " (reverse)" : ""}${overlayBlocks.length > 0 ? " + text" : ""}`,
        quality: "standard",
        provider: "kling",
        status: "queued",
        totalCount: 1,
      })
      .returning();

    await db.insert(videoBatchJobs).values({
      batchId: batch.id,
      workspaceId,
      productId: null,
      formulaId: null,
      jobType: "batch_video",
      status: "queued",
      metadata: {
        footageUrl,
        extendMode: reverse ? "reverse" : "none",
        overlayBlocks,
        overlayLayout,
        overlayFontSize,
        imageStudio: true,
      },
    });

    return NextResponse.json({ batchId: batch.id, jobId: null }, { status: 201 });
  } catch (error) {
    console.error("Error creating image-studio assemble batch:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
