import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { videoBatches, videoBatchJobs } from "@/db/schema";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/image-studio — Higgsfield-style image generation (Image Studio).
 *
 * Body (JSON): workspaceId, sourceImageUrl (product/reference image),
 * prompt (custom scene prompt), aspectRatio ("9:16"|"16:9"|"1:1"|"4:5"),
 * imageSize ("1K"|"2K"|"4K"), batchSize (1-4).
 *
 * Creates one `kling` batch + N `scene_render` jobs (N = batchSize). The
 * worker re-renders the product into an ORIGINAL scene (input image used only
 * as a scale/dimension reference) via Gemini 2.5 Flash Image (Nano Banana
 * Pro), with openai/flux fallbacks. noChain=true → no auto-footage.
 * Poll GET /api/batches/[batchId] for sceneImageUrl per job.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const workspaceId = (body.workspaceId as string) ?? "";
    const sourceImageUrl = (body.sourceImageUrl as string) ?? "";
    const prompt = (body.prompt as string) ?? "";
    const aspectRatio = (body.aspectRatio as string) ?? "9:16";
    const imageSize = (body.imageSize as string) ?? "2K";
    const batchSize = Math.min(Math.max(Number(body.batchSize) || 1, 1), 4);

    if (!workspaceId || !sourceImageUrl || !prompt.trim()) {
      return NextResponse.json(
        { error: "workspaceId, sourceImageUrl and prompt are required" },
        { status: 400 }
      );
    }
    if (!["1K", "2K", "4K"].includes(imageSize)) {
      return NextResponse.json({ error: "imageSize must be 1K, 2K or 4K" }, { status: 400 });
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
        name: `Image Studio: ${prompt.slice(0, 40)}`,
        quality: "standard",
        provider: "kling",
        status: "queued",
        totalCount: batchSize,
      })
      .returning();

    for (let i = 0; i < batchSize; i++) {
      await db.insert(videoBatchJobs).values({
        batchId: batch.id,
        workspaceId,
        productId: null,
        formulaId: null,
        jobType: "scene_render",
        status: "queued",
        metadata: {
          sourceImageUrl,
          scenePromptTemplate: prompt.trim(),
          quality: "pro",
          aspectRatio,
          imageSize,
          noChain: true,
          imageStudio: true,
        },
      });
    }

    return NextResponse.json({ batchId: batch.id, jobCount: batchSize }, { status: 201 });
  } catch (error) {
    console.error("Error creating image-studio batch:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
