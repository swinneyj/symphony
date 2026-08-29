import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  videoBatches,
  videoBatchJobs,
  products,
  llmUsage,
  voices,
  adRemixes,
} from "@/db/schema";
import { eq, asc, inArray, and } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { actualMediaCost, type JobLike } from "@/lib/usage";

/**
 * GET /api/batches/[id] — batch header + jobs (with product name/image) +
 * usage rollup:
 *   usage.llm   — actual LLM tokens/cost attached to this batch (direct rows
 *                 plus jobs in the batch plus remix runs that spawned it)
 *   usage.media — actual non-token media spend (scene images, footage, TTS)
 *                 computed from what the worker wrote, at list prices
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const [batch] = await db.select().from(videoBatches).where(eq(videoBatches.id, id)).limit(1);
    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }
    if (!(await hasWorkspaceAccess(batch.workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const jobs = await db
      .select({
        id: videoBatchJobs.id,
        jobType: videoBatchJobs.jobType,
        status: videoBatchJobs.status,
        script: videoBatchJobs.script,
        sceneImageUrl: videoBatchJobs.sceneImageUrl,
        footageUrl: videoBatchJobs.footageUrl,
        voiceoverUrl: videoBatchJobs.voiceoverUrl,
        finalUrl: videoBatchJobs.finalUrl,
        posted: videoBatchJobs.posted,
        postedAt: videoBatchJobs.postedAt,
        error: videoBatchJobs.error,
        metadata: videoBatchJobs.metadata,
        retries: videoBatchJobs.retries,
        createdAt: videoBatchJobs.createdAt,
        updatedAt: videoBatchJobs.updatedAt,
        productId: videoBatchJobs.productId,
        productName: products.name,
        productImage: products.processedImageUrl,
        productOriginalImage: products.originalImageUrl,
      })
      .from(videoBatchJobs)
      .leftJoin(products, eq(videoBatchJobs.productId, products.id))
      .where(eq(videoBatchJobs.batchId, id))
      .orderBy(asc(videoBatchJobs.createdAt));

    // ── LLM usage rollup ────────────────────────────────────────────────────
    const jobIds = jobs.map((j) => j.id);

    // 1) usage rows attached straight to the batch (script fills etc.)
    const batchRows = await db
      .select()
      .from(llmUsage)
      .where(and(eq(llmUsage.entityType, "batch"), eq(llmUsage.entityId, id)));

    // 2) usage rows attached to individual jobs in this batch
    const jobRows =
      jobIds.length > 0
        ? await db
            .select()
            .from(llmUsage)
            .where(and(eq(llmUsage.entityType, "job"), inArray(llmUsage.entityId, jobIds)))
        : [];

    // 3) remix runs that spawned this batch (Steal This Ad → render flow):
    //    llm_usage rows attached to ad_sources whose remixes landed in this batch.
    const remixRows = await db
      .select({ usage: llmUsage })
      .from(llmUsage)
      .innerJoin(adRemixes, eq(adRemixes.adSourceId, llmUsage.entityId))
      .where(and(eq(llmUsage.entityType, "ad_source"), eq(adRemixes.batchId, id)));

    const llmRows = [...batchRows, ...jobRows, ...remixRows.map((r) => r.usage)];
    const llm = llmRows.reduce(
      (acc, r) => {
        acc.inputTokens += r.inputTokens ?? 0;
        acc.outputTokens += r.outputTokens ?? 0;
        acc.cacheReadTokens += r.cacheReadTokens ?? 0;
        acc.costUsd += Number(r.costUsd ?? 0);
        acc.estimatedCostUsd += Number(r.estimatedCostUsd ?? 0);
        acc.calls += 1;
        return acc;
      },
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0, estimatedCostUsd: 0, calls: 0 }
    );

    // ── Media (non-token) spend ─────────────────────────────────────────────
    let voiceProvider: string | null = null;
    if (batch.voiceId) {
      const [voice] = await db.select().from(voices).where(eq(voices.id, batch.voiceId)).limit(1);
      voiceProvider = voice?.provider ?? null;
    }
    const media = actualMediaCost({
      jobs: jobs.map((j) => ({
        jobType: j.jobType,
        status: j.status,
        sceneImageUrl: j.sceneImageUrl,
        footageUrl: j.footageUrl,
        voiceoverUrl: j.voiceoverUrl,
        script: j.script,
        durationSec: Number((j.metadata as Record<string, unknown>)?.durationSec ?? 6),
      })) as JobLike[],
      quality: batch.quality,
      durationSec: 6,
      engine: batch.provider ?? "sora",
      voiceProvider,
    });

    return NextResponse.json({ ...batch, jobs, usage: { llm, media } });
  } catch (error) {
    console.error("Error fetching batch:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
