import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { blobToken } from "@/lib/blob-token";

export const runtime = "nodejs";

/**
 * GET /api/personas/[id]/image[?ref=0..n]
 * Streams a persona face reference from PRIVATE Blob storage — a browser
 * <img> can't fetch those URLs directly (403 without a Bearer token).
 * No ?ref → the primary face (faceImageUrl); ?ref=N → faceRefUrls[N].
 * Mirrors /api/image-studio/jobs/[id]/asset (images need only the proxy,
 * no Range handling).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const [persona] = await db
      .select({
        id: personas.id,
        workspaceId: personas.workspaceId,
        faceImageUrl: personas.faceImageUrl,
        faceRefUrls: personas.faceRefUrls,
      })
      .from(personas)
      .where(eq(personas.id, id))
      .limit(1);
    if (!persona) return new Response("Persona not found", { status: 404 });

    // Workspace access: system personas (workspaceId null) require the caller
    // to be a member of any workspace that can see them — use ?workspaceId=.
    const workspaceId = persona.workspaceId ?? new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) return new Response("workspaceId required for system persona", { status: 400 });
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return new Response("Forbidden", { status: 403 });
    }

    const search = new URL(request.url).searchParams;
    const refParam = search.get("ref");
    const url =
      refParam !== null
        ? persona.faceRefUrls?.[Number(refParam)] ?? null
        : persona.faceImageUrl;
    if (!url) return new Response("No face image", { status: 404 });

    if (url.includes("blob.vercel-storage.com")) {
      const token = blobToken();
      if (!token) return new Response("Blob token missing", { status: 500 });
      const upstream = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!upstream.ok) return new Response("Upstream error", { status: 502 });
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": upstream.headers.get("content-type") ?? "image/png",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // Public URL (fileUri etc.) — redirect is fine.
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Error streaming persona face:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
