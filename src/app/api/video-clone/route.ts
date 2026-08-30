import { NextResponse } from "next/server";
import { flagJobs } from "@/lib/market/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { videoBatches, videoBatchJobs } from "@/db/schema";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { put } from "@vercel/blob";
import { blobToken } from "@/lib/blob-token";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/video-clone — V2V Clone (backlog row 9, Pipeline A).
 *
 * Body (multipart form): workspaceId, editPrompt, source (video File) XOR
 * sourceVideoUrl (http(s)), textChange?, motionPrompt?, durationSec? (5|10).
 *
 * Creates a `kling` batch + one `v2v_edit` job. The video-worker runs
 * keyframe → nano-banana-pro image edit (bg + on-screen text) → Kling 3.0 Pro
 * re-animate → private Blob → Post Queue. Cost ~$0.15–0.50/clone.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await request.formData();
    const workspaceId = (form.get("workspaceId") as string) ?? "";
    const editPrompt = (form.get("editPrompt") as string) ?? "";
    const textChange = (form.get("textChange") as string | null)?.trim() || undefined;
    const motionPrompt = (form.get("motionPrompt") as string | null)?.trim() || undefined;
    const durationSec = Math.min(Math.max(Number(form.get("durationSec") ?? 5) || 5, 5), 10);
    const model = (form.get("model") as string) || "kling-pro";
    const aspectRatio = (form.get("aspectRatio") as string) || "9:16";
    const resolution = (form.get("resolution") as string) || "720p";
    if (
      ![
        "kling-pro",
        "kling-standard",
        "kling-v1",
        "kling-1.5-pro",
        "kling-turbo",
        "sora",
        "veo",
      ].includes(model)
    ) {
      return NextResponse.json({ error: "invalid model" }, { status: 400 });
    }
    if (!["9:16", "16:9", "1:1"].includes(aspectRatio)) {
      return NextResponse.json({ error: "invalid aspectRatio (9:16 | 16:9 | 1:1)" }, { status: 400 });
    }
    if (!["720p", "1080p"].includes(resolution)) {
      return NextResponse.json({ error: "invalid resolution (720p | 1080p)" }, { status: 400 });
    }
    const file = form.get("source") as File | null;
    const sourceVideoUrl = (form.get("sourceVideoUrl") as string | null)?.trim() ?? "";

    if (!workspaceId || !editPrompt.trim()) {
      return NextResponse.json(
        { error: "workspaceId and editPrompt are required" },
        { status: 400 }
      );
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Source: uploaded file → private Blob, or a direct http(s) URL.
    let sourceUrl = sourceVideoUrl;
    if (file) {
      if (!file.type.startsWith("video/")) {
        return NextResponse.json({ error: "source must be a video file" }, { status: 400 });
      }
      const blob = await put(
        `v2v/${workspaceId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`,
        file,
        {
          access: "private",
          addRandomSuffix: true,
          contentType: file.type || "video/mp4",
          token: blobToken(),
        }
      );
      sourceUrl = blob.url;
    }
    if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) {
      return NextResponse.json(
        { error: "source file or a valid http(s) sourceVideoUrl is required" },
        { status: 400 }
      );
    }

    const [batch] = await db
      .insert(videoBatches)
      .values({
        workspaceId,
        createdById: session.user.id,
        name: `Clone: ${file ? file.name : sourceUrl.slice(0, 60)}`,
        quality: "standard",
        provider: "kling",
        status: "queued",
        totalCount: 1,
      })
      .returning();

    const [job] = await db
      .insert(videoBatchJobs)
      .values({
        batchId: batch.id,
        workspaceId,
        productId: null,
        formulaId: null,
        jobType: "v2v_edit",
        status: "queued",
        metadata: {
          sourceVideoUrl: sourceUrl,
          editPrompt: editPrompt.trim(),
          ...(textChange ? { textChange } : {}),
          ...(motionPrompt ? { motionPrompt } : {}),
          durationSec,
          model,
          aspectRatio,
          resolution,
        },
      })
      .returning();
    await Promise.all([flagJobs("video"), flagJobs("img")]);

    return NextResponse.json({ batchId: batch.id, jobId: job.id }, { status: 201 });
  } catch (error) {
    console.error("Error creating clone job:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
