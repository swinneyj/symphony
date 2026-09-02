import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { personas, workspaceMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { put } from "@vercel/blob";
import { blobToken } from "@/lib/blob-token";
import { presignBlobGet } from "@/lib/blob-presign";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024; // 10MB per photo

/**
 * POST /api/personas/upload-faces
 * Multipart: files[] (1–5 images), workspaceId, personaId? (optional — when
 * editing an existing persona, sets its face refs immediately).
 *
 * The "clone me" path: upload 2–5 photos of a real person; they become the
 * persona's face refs (faceImageUrl = first, faceRefUrls = all) with NO AI
 * text-to-image step. Scene renders then anchor identity on these refs, so
 * videos feature that person (e.g. the account owner) instead of a fictional
 * AI model. Costs $0 (Blob storage only) — no Gemini call.
 *
 * Response: { urls, previewUrls, personaId } — urls are RAW private Blob URLs
 * (store these; served later via /api/personas/[id]/image proxy); previewUrls
 * are short-lived PRESIGNED URLs that render in a browser <img> (raw private
 * URLs 403 a browser fetch — see lib/blob-presign.ts).
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await request.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    const workspaceId = (form.get("workspaceId") as string | null) ?? "";
    const personaId = (form.get("personaId") as string | null) ?? undefined;

    if (files.length === 0) {
      return NextResponse.json({ error: "Select at least one photo" }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Upload at most ${MAX_FILES} photos` }, { status: 400 });
    }
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Optional: attach to an existing persona (edit flow) — same semantics as
    // generate-face with personaId.
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

    // Verify membership (mirrors /api/media/upload) so users only upload into
    // their own workspaces.
    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);
    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const urls: string[] = [];
    const errors: string[] = [];
    for (const [i, file] of files.entries()) {
      const mime = file.type || "application/octet-stream";
      if (!mime.startsWith("image/")) {
        errors.push(`"${file.name}" is not an image`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        errors.push(`"${file.name}" is over 10MB`);
        continue;
      }
      const ext = (mime.split("/")[1] ?? "png").replace(/[^a-z0-9]/gi, "").slice(0, 4) || "png";
      try {
        const blob = await put(
          `persona-faces/${session.user.id.slice(0, 8)}-upload-${Date.now()}-${i}.${ext}`,
          file,
          {
            access: "private",
            addRandomSuffix: true,
            contentType: mime,
            token: blobToken(),
          }
        );
        urls.push(blob.url);
      } catch (e) {
        errors.push((e as Error).message);
      }
    }

    if (urls.length === 0) {
      return NextResponse.json({ error: `Upload failed: ${errors.join(" | ")}` }, { status: 500 });
    }

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

    let previewUrls: string[] = [];
    try {
      previewUrls = await Promise.all(urls.map((u) => presignBlobGet(u)));
    } catch (presignError) {
      console.warn(`[personas] presign preview failed (raw urls still returned): ${(presignError as Error).message}`);
    }

    const partial = errors.length > 0 ? ` (${errors.length} skipped: ${errors.join(" | ")})` : "";
    return NextResponse.json({ urls, previewUrls, personaId, partial }, { status: 201 });
  } catch (error) {
    console.error("Error uploading persona faces:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
