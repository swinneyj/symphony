import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

// Persona detail: GET (read) + PATCH (update) + DELETE. System personas
// (workspaceId null) are read-only — only workspace-owned personas can be
// edited or deleted here. System personas require ?workspaceId= for access.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const [persona] = await db.select().from(personas).where(eq(personas.id, id)).limit(1);
    if (!persona) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }
    const workspaceId = persona.workspaceId ?? new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId || !(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(persona);
  } catch (error) {
    console.error("Error loading persona:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const body = await request.json();
    const workspaceId = body.workspaceId;
    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [existing] = await db.select().from(personas).where(eq(personas.id, id)).limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }
    if (existing.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
    if (body.description !== undefined) patch.description = body.description?.trim() || null;
    if (body.personaPrompt !== undefined) patch.personaPrompt = body.personaPrompt?.trim() || null;
    if (body.voiceId !== undefined) patch.voiceId = body.voiceId || null;
    if (body.faceImageUrl !== undefined) patch.faceImageUrl = body.faceImageUrl || null;
    if (Array.isArray(body.faceRefUrls)) {
      patch.faceRefUrls = body.faceRefUrls.filter((u: unknown) => typeof u === "string" && u.length > 0);
    }

    const [updated] = await db.update(personas).set(patch).where(eq(personas.id, id)).returning();
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating persona:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const workspaceId = body.workspaceId;
    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [existing] = await db.select().from(personas).where(eq(personas.id, id)).limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }
    if (existing.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(personas).where(eq(personas.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting persona:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
