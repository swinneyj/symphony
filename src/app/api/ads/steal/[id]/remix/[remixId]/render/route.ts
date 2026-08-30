import { NextResponse } from "next/server";
import { flagJobs } from "@/lib/market/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  adSources,
  adRemixes,
  videoBatches,
  videoBatchJobs,
  videoFormulas,
  products,
  voices,
} from "@/db/schema";
import { eq, and, or, isNull, asc } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

/**
 * POST /api/ads/steal/[id]/remix/[remixId]/render
 * Body: { workspaceId, productId, voiceId?, formulaId? }
 *
 * Sends a remix script through the existing render pipeline: creates a batch
 * + one footage job whose script is the remix (scriptOverride). The video
 * worker chains footage → final assembly (VO + overlay) and the finished
 * video lands in the Post Queue, exactly like Batch Studio.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; remixId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, remixId } = await params;
    const userId = session.user.id;

    const [source] = await db
      .select()
      .from(adSources)
      .where(eq(adSources.id, id))
      .limit(1);
    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }
    if (!(await hasWorkspaceAccess(source.workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [remix] = await db
      .select()
      .from(adRemixes)
      .where(eq(adRemixes.id, remixId))
      .limit(1);
    if (!remix || remix.adSourceId !== id) {
      return NextResponse.json({ error: "Remix not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const workspaceId = body?.workspaceId ?? source.workspaceId;
    const { productId, voiceId, formulaId } = body ?? {};
    if (!productId) {
      return NextResponse.json(
        { error: "productId is required (the product this ad promotes)" },
        { status: 400 }
      );
    }

    // Product must belong to the workspace.
    const [product] = await db
      .select()
      .from(products)
      .where(
        and(eq(products.id, productId), eq(products.workspaceId, workspaceId))
      )
      .limit(1);
    if (!product) {
      return NextResponse.json(
        { error: "Product not found in this workspace" },
        { status: 404 }
      );
    }
    // A raw/processing product has no footage — never queue a doomed batch.
    if (product.status !== "ready") {
      return NextResponse.json(
        {
          error: `Product "${product.name}" is not ready yet (status: ${product.status}) — finalize it in Products first`,
        },
        { status: 400 }
      );
    }

    // Voice (optional) must exist.
    if (voiceId) {
      const [voice] = await db.select().from(voices).where(eq(voices.id, voiceId)).limit(1);
      if (!voice) {
        return NextResponse.json({ error: "Voice not found" }, { status: 404 });
      }
    }

    // Formula: explicit, else the first available (system or workspace) —
    // same default Batch Studio exposes. Its scene/motion/overlay settings
    // drive the footage job; the remix script replaces its scriptTemplate.
    let formula;
    if (formulaId) {
      const [f] = await db.select().from(videoFormulas).where(eq(videoFormulas.id, formulaId)).limit(1);
      formula = f;
    } else {
      const available = await db
        .select()
        .from(videoFormulas)
        .where(
          or(
            isNull(videoFormulas.workspaceId),
            eq(videoFormulas.workspaceId, workspaceId)
          )
        )
        .orderBy(asc(videoFormulas.createdAt))
        .limit(1);
      formula = available[0];
    }
    if (!formula) {
      return NextResponse.json(
        { error: "No video formula available — create one in Video Studio first" },
        { status: 404 }
      );
    }

    // Graph-authored node data wins over flat formula fields (same as batches).
    const g = (formula.nodeGraph ?? null) as
      | { nodes?: Array<{ type?: string; data?: Record<string, unknown> }> }
      | null;
    const nodes = g?.nodes ?? [];
    const by = (t: string) => nodes.find((n) => n.type === t)?.data ?? {};
    const sceneNode = by("sceneRender");
    const footageNode = by("footage");
    const scriptNode = by("script");
    const overlayNode = by("overlay");
    const boomerang = nodes.some((n) => n.type === "boomerang");

    // Fill any {product}/{price} slots the remix references, leave the rest.
    const script = remix.script
      .replaceAll("{product}", product.name)
      .replaceAll("{price}", product.price != null ? String(product.price) : "");

    const [batch] = await db
      .insert(videoBatches)
      .values({
        workspaceId,
        createdById: userId,
        name: `Steal: ${source.title?.slice(0, 60) ?? source.sourceUrl.slice(0, 60)}`,
        formulaId: formula.id,
        voiceId: voiceId ?? null,
        quality: "standard",
        provider: "sora" as never,
        status: "queued",
        totalCount: 1,
      })
      .returning();

    await db.insert(videoBatchJobs).values({
      batchId: batch.id,
      workspaceId,
      productId: product.id,
      formulaId: formula.id,
      jobType: "footage",
      status: "queued",
      script,
      metadata: {
        extendMode: boomerang ? "reverse" : "none",
        overlayTemplate:
          (overlayNode.text as string | undefined) ?? formula.overlayTemplate ?? null,
        ...(sceneNode.prompt ? { scenePromptTemplate: sceneNode.prompt } : {}),
        ...(footageNode.motionPreset ? { motionPreset: footageNode.motionPreset } : {}),
        ...(footageNode.durationSec ? { durationSec: Number(footageNode.durationSec) } : {}),
        ...(footageNode.quality ? { quality: footageNode.quality } : {}),
        ...(scriptNode.scriptTemplate ? { sourceScriptTemplate: scriptNode.scriptTemplate } : {}),
        stealThisAd: { adSourceId: id, remixId },
      },
    });
    await Promise.all([flagJobs("video"), flagJobs("img")]);

    // Mark the remix rendered + linked to its batch.
    await db
      .update(adRemixes)
      .set({ status: "rendered", batchId: batch.id, updatedAt: new Date() })
      .where(eq(adRemixes.id, remixId));

    return NextResponse.json({ batchId: batch.id, batchName: batch.name }, { status: 201 });
  } catch (error) {
    console.error("Error rendering remix:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
