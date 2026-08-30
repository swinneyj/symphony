import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { personas, personaMedia, mediaAssets, voices, videoBatchJobs, videoBatches, videoFormulas, products } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

/**
 * GET /api/personas/[id]/media — asset hub payload:
 *   photos — junction rows (face_ref / generated_photo / voice_sample / thumbnail)
 *   videos — every render featuring the model (jobs with metadata->>'personaId')
 *   voice  — persona's voice row (samples from the junction)
 *   usage  — formulas / batches / published posts counts
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const [persona] = await db.select().from(personas).where(eq(personas.id, id)).limit(1);
    if (!persona) return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    const wsId = persona.workspaceId ?? new URL(request.url).searchParams.get("workspaceId");
    if (!wsId || !(await hasWorkspaceAccess(wsId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const photos = await db
      .select({
        id: personaMedia.id,
        role: personaMedia.role,
        createdAt: personaMedia.createdAt,
        mediaAssetId: mediaAssets.id,
        fileName: mediaAssets.fileName,
        mimeType: mediaAssets.mimeType,
        url: mediaAssets.url,
        thumbnailUrl: mediaAssets.thumbnailUrl,
      })
      .from(personaMedia)
      .innerJoin(mediaAssets, eq(personaMedia.mediaAssetId, mediaAssets.id))
      .where(eq(personaMedia.personaId, id))
      .orderBy(personaMedia.createdAt);

    const videos = await db
      .select({
        id: videoBatchJobs.id,
        jobType: videoBatchJobs.jobType,
        status: videoBatchJobs.status,
        finalUrl: videoBatchJobs.finalUrl,
        thumbnailUrl: videoBatchJobs.thumbnailUrl,
        updatedAt: videoBatchJobs.updatedAt,
        batchName: videoBatches.name,
        formulaName: videoFormulas.name,
        productName: products.name,
        posted: videoBatchJobs.posted,
      })
      .from(videoBatchJobs)
      .leftJoin(videoBatches, eq(videoBatchJobs.batchId, videoBatches.id))
      .leftJoin(videoFormulas, eq(videoBatchJobs.formulaId, videoFormulas.id))
      .leftJoin(products, eq(videoBatchJobs.productId, products.id))
      .where(sql`${videoBatchJobs.metadata}->>'personaId' = ${id}`)
      .orderBy(sql`${videoBatchJobs.updatedAt} desc`)
      .limit(50);

    const [voice] = persona.voiceId
      ? await db.select().from(voices).where(eq(voices.id, persona.voiceId)).limit(1)
      : [null];
    const voiceSamples = persona.voiceId
      ? await db
          .select({ url: mediaAssets.url, fileName: mediaAssets.fileName })
          .from(personaMedia)
          .innerJoin(mediaAssets, eq(personaMedia.mediaAssetId, mediaAssets.id))
          .where(and(eq(personaMedia.personaId, id), eq(personaMedia.role, "voice_sample")))
          .limit(5)
      : [];

    const formulaRows = await db
      .select({ id: videoFormulas.id, name: videoFormulas.name })
      .from(videoFormulas)
      .where(eq(videoFormulas.personaId, id))
      .limit(100);
    const [batchCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(videoBatches)
      .where(eq(videoBatches.personaId, id));
    const [postCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(videoBatchJobs)
      .where(and(eq(videoBatchJobs.posted, true), sql`${videoBatchJobs.metadata}->>'personaId' = ${id}`));

    return NextResponse.json({
      photos,
      videos,
      voice: voice ? { ...voice, samples: voiceSamples } : null,
      usage: {
        formulas: formulaRows,
        batches: batchCount?.n ?? 0,
        posts: postCount?.n ?? 0,
      },
    });
  } catch (error) {
    console.error("Error loading persona media hub:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/personas/[id]/media — attach an existing media_assets row
 * (e.g. an upload from the gallery). Body: { mediaAssetId, role }.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { mediaAssetId, role } = body as { mediaAssetId?: string; role?: string };

    if (!mediaAssetId || typeof mediaAssetId !== "string") {
      return NextResponse.json({ error: "mediaAssetId is required" }, { status: 400 });
    }
    const allowedRoles = ["face_ref", "generated_photo", "voice_sample", "thumbnail"];
    const safeRole = allowedRoles.includes(role ?? "") ? role : "generated_photo";

    const [persona] = await db.select().from(personas).where(eq(personas.id, id)).limit(1);
    if (!persona) return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    const wsId = persona.workspaceId ?? new URL(request.url).searchParams.get("workspaceId");
    if (!wsId || !(await hasWorkspaceAccess(wsId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const [asset] = await db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, mediaAssetId), eq(mediaAssets.workspaceId, wsId)))
      .limit(1);
    if (!asset) return NextResponse.json({ error: "Media asset not found in this workspace" }, { status: 404 });

    const [row] = await db
      .insert(personaMedia)
      .values({ personaId: id, mediaAssetId, role: safeRole as never })
      .onConflictDoNothing()
      .returning();
    return NextResponse.json({ attached: row ?? null }, { status: row ? 201 : 200 });
  } catch (error) {
    console.error("Error attaching media to persona:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
