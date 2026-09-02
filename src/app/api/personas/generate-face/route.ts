import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { personas, aiGenerations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { generatePersonaFaces } from "@/services/persona-face";
import { presignBlobGet } from "@/lib/blob-presign";

/**
 * POST /api/personas/generate-face
 * Body: { workspaceId, personaId, description, count? (1–5, default 3) }
 * Generates Nano Banana face images from a text description, stores them to
 * private Blob, and sets them as the persona's face refs
 * (faceImageUrl = first, faceRefUrls = all). Costs ~$0.04–0.08/img, recorded
 * as an ai_generations row (result.costUsd).
 *
 * Response: { urls, previewUrls, costUsd } — `urls` are the RAW private Blob
 * URLs (store these in the DB; served later through the Bearer proxy), while
 * `previewUrls` are short-lived PRESIGNED URLs that render in a browser
 * <img> immediately (raw private URLs 403 a browser fetch — see
 * lib/blob-presign.ts). The create dialog shows previewUrls but saves urls.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { workspaceId, personaId, description, count } = body as {
      workspaceId?: string;
      personaId?: string;
      description?: string;
      count?: number;
    };

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }
    if (!description || typeof description !== "string" || description.trim().length < 10) {
      return NextResponse.json(
        { error: "description is required (10+ characters — e.g. '24-year-old blonde fitness creator, athletic build')" },
        { status: 400 }
      );
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // personaId optional: when creating a new persona the caller generates
    // faces FIRST (no persona row yet) and attaches the URLs on create.
    let persona: (typeof personas.$inferSelect) | null = null;
    if (personaId) {
      const [found] = await db.select().from(personas).where(eq(personas.id, personaId)).limit(1);
      if (!found) {
        return NextResponse.json({ error: "Persona not found" }, { status: 404 });
      }
      if (found.workspaceId !== workspaceId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      persona = found;
    }

    const { urls, costUsd } = await generatePersonaFaces(
      description.trim(),
      typeof count === "number" ? count : 3,
      { workspaceId, userId: session.user.id }
    );

    // Existing persona: make it usable immediately (first face = primary).
    if (persona) {
      await db
        .update(personas)
        .set({
          faceImageUrl: persona.faceImageUrl ?? urls[0],
          faceRefUrls: urls,
          updatedAt: new Date(),
        })
        .where(eq(personas.id, persona.id));
    }

    await db.insert(aiGenerations).values({
      workspaceId,
      userId: session.user.id,
      type: "image",
      prompt: `persona face: ${description.trim()}`,
      result: { urls, costUsd, personaId },
    });

    // Short-lived presigned URLs for the create-dialog preview (<img> can't
    // fetch raw private Blob URLs — 403 without a Bearer token). DB keeps
    // the raw urls (served via /api/personas/[id]/image proxy afterwards).
    let previewUrls: string[] = [];
    try {
      previewUrls = await Promise.all(urls.map((u) => presignBlobGet(u)));
    } catch (presignError) {
      console.warn(`[personas] presign preview failed (raw urls still returned): ${(presignError as Error).message}`);
    }

    return NextResponse.json({ urls, previewUrls, costUsd, personaId });
  } catch (error) {
    console.error("Error generating persona faces:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
