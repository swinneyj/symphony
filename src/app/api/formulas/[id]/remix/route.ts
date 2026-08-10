import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { videoFormulas, workspaceMembers, workspaces } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * POST /api/formulas/[id]/remix — copy any formula (system or shared) into
 * the caller's newest workspace as their own editable formula.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const [source] = await db
      .select()
      .from(videoFormulas)
      .where(eq(videoFormulas.id, id))
      .limit(1);
    if (!source) {
      return NextResponse.json({ error: "Formula not found" }, { status: 404 });
    }

    // Caller's newest workspace (same convention as /api/workspaces + connect).
    const [membership] = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, session.user.id))
      .orderBy(desc(workspaces.createdAt))
      .limit(1);
    if (!membership) {
      return NextResponse.json({ error: "No workspace for user" }, { status: 404 });
    }

    const [copy] = await db
      .insert(videoFormulas)
      .values({
        workspaceId: membership.workspaceId,
        name: `${source.name} (copy)`,
        category: source.category ?? "generic",
        scriptTemplate: source.scriptTemplate,
        scenePromptTemplate: source.scenePromptTemplate,
        motionPreset: source.motionPreset ?? "none",
        durationSec: source.durationSec ?? 6,
        quality: source.quality ?? "standard",
        boomerang: source.boomerang,
        overlayTemplate: source.overlayTemplate,
        nodeGraph: source.nodeGraph ?? null,
        isSystem: false,
      })
      .returning();

    return NextResponse.json(copy, { status: 201 });
  } catch (error) {
    console.error("Error remixing formula:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
