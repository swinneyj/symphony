import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { personas, voices, users } from "@/db/schema";
import { eq, desc, or, and, isNull } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

/**
 * GET /api/personas?workspaceId=<id>
 * Lists the workspace's personas plus system personas (newest first, system
 * first), with voice name/provider joined.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows = await db
      .select({
        id: personas.id,
        workspaceId: personas.workspaceId,
        createdById: personas.createdById,
        createdByName: users.name,
        name: personas.name,
        description: personas.description,
        faceImageUrl: personas.faceImageUrl,
        faceRefUrls: personas.faceRefUrls,
        voiceId: personas.voiceId,
        voiceName: voices.name,
        voiceProvider: voices.provider,
        personaPrompt: personas.personaPrompt,
        isSystem: personas.isSystem,
        createdAt: personas.createdAt,
        updatedAt: personas.updatedAt,
      })
      .from(personas)
      .leftJoin(users, eq(personas.createdById, users.id))
      .leftJoin(voices, eq(personas.voiceId, voices.id))
      .where(
        or(
          eq(personas.workspaceId, workspaceId),
          and(isNull(personas.workspaceId), eq(personas.isSystem, true))
        )
      )
      .orderBy(desc(personas.isSystem), desc(personas.createdAt));

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Error listing personas:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/personas
 * Creates a persona. Body: { workspaceId, name, description?, personaPrompt?,
 * voiceId?, faceImageUrl?, faceRefUrls? }
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, name, description, personaPrompt, voiceId, faceImageUrl, faceRefUrls } = body;

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Persona name is required" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const refs = Array.isArray(faceRefUrls)
      ? faceRefUrls.filter((u): u is string => typeof u === "string" && u.length > 0)
      : [];

    const [persona] = await db
      .insert(personas)
      .values({
        workspaceId,
        createdById: session.user.id,
        name: name.trim(),
        description: description?.trim() || null,
        personaPrompt: personaPrompt?.trim() || null,
        voiceId: voiceId || null,
        faceImageUrl: faceImageUrl || null,
        faceRefUrls: refs,
      })
      .returning();

    return NextResponse.json(persona, { status: 201 });
  } catch (error) {
    console.error("Error creating persona:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
