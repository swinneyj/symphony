import { NextResponse } from "next/server";
import { flagJobs } from "@/lib/market/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { products, videoBatches, videoBatchJobs, videoFormulas, voices, personas, llmUsage } from "@/db/schema";
import { eq, desc, inArray, and } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { actualMediaCost } from "@/lib/usage";
import { renderScript } from "@/lib/video/script-fill";
import { buildPersonaScenePrompt } from "@/lib/video/persona-scene";

/**
 * Flatten a Formula Studio node graph into per-product formula config.
 * The graph is a linear chain: product → sceneRender → footage → script →
 * voice → overlay → boomerang → output. Missing nodes fall back to the
 * formula's flat fields.
 */
function flattenGraph(
  graph: unknown
): { scriptTemplate?: string; scenePromptTemplate?: string; motionPreset?: string; durationSec?: number; quality?: string; overlayTemplate?: string; boomerang?: boolean } {
  const g = graph as { nodes?: Array<{ type?: string; data?: Record<string, unknown> }> };
  const nodes = g?.nodes ?? [];
  const by = (t: string) => nodes.find((n) => n.type === t)?.data ?? {};
  const script = by("script");
  const scene = by("sceneRender");
  const footage = by("footage");
  const overlay = by("overlay");
  return {
    scriptTemplate: (script.scriptTemplate as string | undefined) ?? undefined,
    scenePromptTemplate: (scene.prompt as string | undefined) ?? undefined,
    motionPreset: (footage.motionPreset as string | undefined) ?? undefined,
    durationSec: footage.durationSec != null ? Number(footage.durationSec) : undefined,
    quality: (footage.quality as string | undefined) ?? undefined,
    overlayTemplate: (overlay.text as string | undefined) ?? undefined,
    boomerang: nodes.some((n) => n.type === "boomerang"),
  };
}

/** Run-view overlay box (position + style) as sent from the formula editor. */
interface RunOverlayBox {
  x: number;
  y: number;
  fontColor?: string;
  bgColor?: string;
  bgOpacity?: number;
  fontSize?: number;
  fontFamily?: string;
  treatment?: string;
  textAlign?: string;
  width?: number;
  height?: number;
}

/** Normalize a run-view overlay box for the worker: clamp position, keep only
 *  well-formed hex colors and a 0..1 opacity so arbitrary strings can never
 *  reach the ffmpeg drawtext filter. */
function sanitizeOverlayBox(p: RunOverlayBox): RunOverlayBox {
  const hex = (v?: string): string | undefined => {
    if (!v) return undefined;
    const m = /^#?([0-9a-fA-F]{6})$/.exec(v.trim());
    return m ? `#${m[1].toUpperCase()}` : undefined;
  };
  const fontColor = hex(p.fontColor);
  const bgColor = hex(p.bgColor);
  const fontFamily = ["tiktok", "snapchat", "anton", "montserrat", "poppins", "bebas"].includes(p.fontFamily ?? "")
    ? p.fontFamily
    : "tiktok";
  const treatment = ["outline", "inverse", "box", "box-inverse", "plain"].includes(p.treatment ?? "")
    ? p.treatment
    : "outline";
  const textAlign = ["left", "center", "right"].includes(p.textAlign ?? "") ? p.textAlign : "center";
  return {
    x: Math.min(0.95, Math.max(0.05, Number(p.x) || 0.5)),
    y: Math.min(0.92, Math.max(0.05, Number(p.y) || 0.5)),
    ...(fontColor ? { fontColor } : {}),
    ...(bgColor ? { bgColor } : {}),
    ...(p.bgOpacity != null ? { bgOpacity: Math.min(1, Math.max(0, Number(p.bgOpacity) || 0)) } : {}),
    ...(p.fontSize != null
      ? { fontSize: Math.min(120, Math.max(18, Math.round(Number(p.fontSize) || 72))) }
      : {}),
    fontFamily,
    treatment,
    textAlign,
    width: Math.min(0.92, Math.max(0.2, Number(p.width) || 0.8)),
    height: Math.min(0.5, Math.max(0.08, Number(p.height) || 0.16)),
  };
}

/**
 * GET /api/batches?workspaceId=…  — list batches + per-batch progress
 * POST /api/batches               — create a batch (batch + one footage job per product)
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const batches = await db
      .select()
      .from(videoBatches)
      .where(eq(videoBatches.workspaceId, workspaceId))
      .orderBy(desc(videoBatches.createdAt));

    const jobs = await db
      .select({
        id: videoBatchJobs.id,
        batchId: videoBatchJobs.batchId,
        status: videoBatchJobs.status,
        jobType: videoBatchJobs.jobType,
        sceneImageUrl: videoBatchJobs.sceneImageUrl,
        footageUrl: videoBatchJobs.footageUrl,
        voiceoverUrl: videoBatchJobs.voiceoverUrl,
        script: videoBatchJobs.script,
        metadata: videoBatchJobs.metadata,
      })
      .from(videoBatchJobs)
      .where(eq(videoBatchJobs.workspaceId, workspaceId));

    // LLM ledger + voice providers for per-batch spend rollups.
    const llmRows = await db
      .select()
      .from(llmUsage)
      .where(eq(llmUsage.workspaceId, workspaceId));
    const voiceRows = await db
      .select({ id: voices.id, provider: voices.provider })
      .from(voices)
      .where(eq(voices.workspaceId, workspaceId));
    const voiceProviderBy = new Map(voiceRows.map((v) => [v.id, v.provider]));

    const withProgress = batches.map((batch) => {
      const batchJobs = jobs.filter((j) => j.batchId === batch.id);
      const jobIdSet = new Set(batchJobs.map((j) => j.id));
      let llmCostUsd = 0;
      let calls = 0;
      for (const r of llmRows) {
        const attached =
          (r.entityType === "batch" && r.entityId === batch.id) ||
          (r.entityType === "job" && r.entityId !== null && jobIdSet.has(r.entityId));
        if (attached) {
          llmCostUsd += Number(r.costUsd ?? 0);
          calls += 1;
        }
      }
      const media = actualMediaCost({
        jobs: batchJobs.map((j) => ({
          jobType: j.jobType,
          status: j.status,
          sceneImageUrl: j.sceneImageUrl,
          footageUrl: j.footageUrl,
          voiceoverUrl: j.voiceoverUrl,
          script: j.script,
          durationSec: Number((j.metadata as Record<string, unknown>)?.durationSec ?? 6),
        })),
        quality: batch.quality,
        durationSec: 6,
        engine: batch.provider ?? "sora",
        voiceProvider: batch.voiceId ? (voiceProviderBy.get(batch.voiceId) ?? null) : null,
      });
      return {
        ...batch,
        jobsTotal: batchJobs.length,
        jobsDone: batchJobs.filter((j) => j.status === "done").length,
        jobsFailed: batchJobs.filter((j) => j.status === "failed").length,
        aiCostUsd: llmCostUsd + media.totalUsd,
        aiLlmCostUsd: llmCostUsd,
        aiLlmCalls: calls,
      };
    });

    return NextResponse.json(withProgress);
  } catch (error) {
    console.error("Error listing batches:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      workspaceId,
      name,
      formulaId,
      voiceId,
      quality = "standard",
      provider,
      productIds,
      tiktokAccountId,
      // How many videos to generate PER selected product (Market quick-create:
      // 1/5/10/15). More variants = more engine generations = more cost.
      videosPerProduct,
      // Run-view overrides (BatchBot view=run): explicit user choices beat
      // formula defaults for this batch only.
      durationSec: runDurationSec,
      boomerang: runBoomerang,
      overlayTemplate: runOverlayTemplate,
      overlayBlocks: runOverlayBlocks,
      overlayFontSize,
      overlayLayout: runOverlayLayout,
      imageResolution,
      personaId,
    }: {
      workspaceId?: string;
      name?: string;
      formulaId?: string;
      voiceId?: string | null;
      personaId?: string | null;
      quality?: string;
      provider?: string;
      productIds?: string[];
      tiktokAccountId?: string | null;
      videosPerProduct?: number;
      durationSec?: number | null;
      boomerang?: boolean | null;
      overlayTemplate?: string | null;
      overlayBlocks?: string[] | null;
      overlayFontSize?: number | null;
      overlayLayout?: RunOverlayBox[] | null;
      imageResolution?: string | null;
    } = body;

    if (!workspaceId || !name?.trim() || !formulaId || !Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { error: "workspaceId, name, formulaId and at least one productId are required" },
        { status: 400 }
      );
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Videos per product: 1..15 (Market quick-create). Guard against absurd counts.
    const perProduct = Math.min(Math.max(Math.trunc(Number(videosPerProduct) || 1), 1), 15);

    // Formula must exist (system or this workspace's).
    const [formula] = await db
      .select()
      .from(videoFormulas)
      .where(eq(videoFormulas.id, formulaId))
      .limit(1);
    if (!formula) {
      return NextResponse.json({ error: "Formula not found" }, { status: 404 });
    }

    // Optional voice must exist.
    if (voiceId) {
      const [voice] = await db.select().from(voices).where(eq(voices.id, voiceId)).limit(1);
      if (!voice) {
        return NextResponse.json({ error: "Voice not found" }, { status: 404 });
      }
    }

    // Optional AI-influencer persona must exist and belong to the workspace
    // (system personas are visible to every workspace).
    let persona: (typeof personas.$inferSelect) | null = null;
    if (personaId) {
      const [found] = await db.select().from(personas).where(eq(personas.id, personaId)).limit(1);
      if (!found) {
        return NextResponse.json({ error: "Persona not found" }, { status: 404 });
      }
      if (found.workspaceId !== null && found.workspaceId !== workspaceId) {
        return NextResponse.json({ error: "Persona does not belong to this workspace" }, { status: 403 });
      }
      persona = found;
    }
    // Persona voice wins over the formula default; an explicit run-view voice
    // pick still wins over both.
    const effectiveVoiceId = voiceId ?? persona?.voiceId ?? null;

    // All products must belong to the workspace.
    const owned = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.workspaceId, workspaceId), inArray(products.id, productIds)));
    if (owned.length !== productIds.length) {
      return NextResponse.json(
        { error: "One or more products do not belong to this workspace" },
        { status: 400 }
      );
    }

    const productRows = await db
      .select()
      .from(products)
      .where(inArray(products.id, productIds));

    // Graph-authored formulas win over flat fields (per-node data).
    const cfg = formula.nodeGraph ? flattenGraph(formula.nodeGraph) : null;
    const scriptTemplate = cfg?.scriptTemplate ?? formula.scriptTemplate;
    let gScenePrompt = cfg?.scenePromptTemplate ?? null;
    const gMotionPreset = cfg?.motionPreset ?? null;
    const gDurationSec = cfg?.durationSec ?? null;
    const gQuality = cfg?.quality ?? null;
    const overlayTemplate = cfg?.overlayTemplate ?? formula.overlayTemplate;
    const boomerang = cfg?.boomerang ?? formula.boomerang;
    // AI-influencer persona override: when a face-ref persona is selected and
    // the formula wasn't authored for that persona, swap the scene prompt to a
    // presenter shot ("persona presents the product") so the influencer
    // actually appears in the video. Product-only formula templates ("do not
    // add people") otherwise win and the persona never shows up.
    const personaHasFaceRefs = (persona?.faceRefUrls?.length ?? 0) > 0;
    if (personaHasFaceRefs && formula.personaId !== persona?.id && persona) {
      gScenePrompt = buildPersonaScenePrompt(persona);
    }
    // source_frame='render' formulas must run the scene_render job FIRST so the
    // video is generated from a re-created scene (product photo as reference),
    // not the flat listing photo. The worker chains scene_render → footage.
    // A face-ref persona ALSO forces scene render — the persona is composited
    // into the frame at scene-render time, so footage directly on the listing
    // photo would never contain the influencer.
    const needsSceneRender = formula.sourceFrame === "render" || personaHasFaceRefs;
    // Keep compatibility with databases that have not applied the optional
    // Kling-specific enum migration yet; the exact model travels with jobs.
    const dbProvider = provider === "kling_v1" || provider === "kling_v3" ? "kling" : provider;

    // Sequential inserts — Neon HTTP driver has no transactions.
    const [batch] = await db
      .insert(videoBatches)
      .values({
        workspaceId,
        createdById: session.user.id,
        name: name.trim(),
        formulaId,
        voiceId: effectiveVoiceId,
        personaId: persona?.id ?? null,
        quality,
        provider: (dbProvider as never) ?? "sora",
        status: "queued",
        totalCount: productRows.length * perProduct,
      })
      .returning();

    for (const product of productRows) {
      const rendered = await renderScript(
        scriptTemplate,
        {
          name: product.name,
          description: product.description,
          price: product.price,
        },
        {
          llm: false,
          persona: persona ? { name: persona.name, personaPrompt: persona.personaPrompt } : undefined,
        }
      );
      // One job per product × videos-per-product (Market quick-create).
      for (let v = 0; v < perProduct; v += 1) {
      await db.insert(videoBatchJobs).values({
        batchId: batch.id,
        workspaceId,
        productId: product.id,
        formulaId: formula.id,
        // source_frame='render' → run scene_render first (re-creates the
        // product in the formula's scene, product photo as reference), which
        // the worker chains into footage. Otherwise footage runs directly on
        // the listing photo.
        jobType: needsSceneRender ? "scene_render" : "footage",
        status: "queued",
        script: rendered.script,
        metadata: {
          ...(provider === "kling_v1" || provider === "kling_v3" ? { videoEngine: provider } : {}),
          // Boomerang + CTA overlay flow from the formula to the final assembly.
          // Run-view overrides win when the user touched them in view=run.
          extendMode: (runBoomerang ?? boomerang) ? "reverse" : "none",
          overlayTemplate: runOverlayTemplate ?? overlayTemplate ?? null,
          ...(Array.isArray(runOverlayBlocks)
            ? { overlayBlocks: runOverlayBlocks.map((line) => String(line).trim()).filter(Boolean).slice(0, 12) }
            : {}),
          ...(overlayFontSize ? { overlayFontSize } : {}),
          // Per-line overlay boxes (position + style) from the run view's
          // WYSIWYG canvas. Only passed when it lines up with the non-empty
          // overlay lines. Colors are sanitized here, never trusted raw.
          ...(Array.isArray(runOverlayLayout) && runOverlayLayout.length > 0
            ? { overlayLayout: runOverlayLayout.map(sanitizeOverlayBox) }
            : {}),
          // Which TikTok account this batch publishes to (multi-account).
          ...(tiktokAccountId ? { tiktokAccountId } : {}),
          // Graph-authored scene/motion/duration/quality override the formula row.
          ...(gScenePrompt ? { scenePromptTemplate: gScenePrompt } : {}),
          ...(gMotionPreset ? { motionPreset: gMotionPreset } : {}),
          // AI-influencer persona: face refs + style flow to the scene render
          // (identity consistency) — the worker threads them into Nano Banana.
          ...(persona
            ? {
                personaRefs: (persona.faceRefUrls ?? []).slice(0, 5),
                personaPrompt: persona.personaPrompt ?? null,
              }
            : {}),
          // Run-view length beats graph beats formula flat.
          ...(runDurationSec ? { durationSec: runDurationSec } : gDurationSec ? { durationSec: gDurationSec } : {}),
          // Run-view quality beats graph beats formula flat.
          ...(quality && quality !== "standard" ? { quality } : gQuality ? { quality: gQuality } : {}),
          ...(imageResolution ? { imageResolution } : {}),
          // Variant index when the user asked for N videos per product.
          ...(perProduct > 1 ? { variant: v + 1, variantCount: perProduct } : {}),
        },
      });
      }
      await Promise.all([flagJobs("video"), flagJobs("img")]);
    }

    return NextResponse.json(batch, { status: 201 });
  } catch (error) {
    console.error("Error creating batch:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
