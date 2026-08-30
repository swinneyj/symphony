import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { personas, personaMedia } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

/**
 * DELETE /api/personas/[id]/media/[mediaAssetId] — detach an asset from the
 * persona (the asset itself stays in media_assets for publish use).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; mediaAssetId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id, mediaAssetId } = await params;

    const [persona] = await db.select().from(personas).where(eq(personas.id, id)).limit(1);
    if (!persona) return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    const wsId = persona.workspaceId ?? new URL(request.url).searchParams.get("workspaceId");
    if (!wsId || !(await hasWorkspaceAccess(wsId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [deleted] = await db
      .delete(personaMedia)
      .where(and(eq(personaMedia.personaId, id), eq(personaMedia.mediaAssetId, mediaAssetId)))
      .returning({ id: personaMedia.id });
    if (!deleted) return NextResponse.json({ error: "Not attached" }, { status: 404 });
    return NextResponse.json({ detached: true });
  } catch (error) {
    console.error("Error detaching media from persona:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
