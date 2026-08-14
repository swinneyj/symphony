import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { videoFormulas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

/**
 * GET /api/formulas/[id] — fetch one formula (system or workspace-owned).
 * PATCH /api/formulas/[id] — update a workspace's own formula.
 * DELETE /api/formulas/[id] — delete a workspace's own formula.
 * System formulas (workspaceId null) are read-only: 403 on write.
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
    const [formula] = await db
      .select()
      .from(videoFormulas)
      .where(eq(videoFormulas.id, id))
      .limit(1);
    if (!formula) {
      return NextResponse.json({ error: "Formula not found" }, { status: 404 });
    }

    // System formulas (workspaceId null) are visible to any authed user.
    // Workspace formulas require membership.
    if (formula.workspaceId !== null) {
      if (!(await hasWorkspaceAccess(formula.workspaceId, session.user.id))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    return NextResponse.json(formula);
  } catch (error) {
    console.error("Error fetching formula:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
async function loadOwnedFormula(id: string, userId: string) {
  const [formula] = await db
    .select()
    .from(videoFormulas)
    .where(eq(videoFormulas.id, id))
    .limit(1);

  if (!formula) return { error: "Formula not found", status: 404 } as const;
  if (formula.workspaceId === null) {
    return { error: "System formulas are read-only", status: 403 } as const;
  }
  if (!(await hasWorkspaceAccess(formula.workspaceId, userId))) {
    return { error: "Forbidden", status: 403 } as const;
  }
  return { formula } as const;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const owned = await loadOwnedFormula(id, session.user.id);
    if ("error" in owned) {
      return NextResponse.json(
        { error: owned.error },
        { status: owned.status }
      );
    }

    const body = await request.json();
    const patch: Record<string, unknown> = {};
    for (const key of [
      "name",
      "category",
      "scriptTemplate",
      "scenePromptTemplate",
      "motionPreset",
      "durationSec",
      "quality",
      "boomerang",
      "overlayTemplate",
      "nodeGraph",
    ]) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(videoFormulas)
      .set(patch)
      .where(eq(videoFormulas.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating formula:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const owned = await loadOwnedFormula(id, session.user.id);
    if ("error" in owned) {
      return NextResponse.json(
        { error: owned.error },
        { status: owned.status }
      );
    }

    await db.delete(videoFormulas).where(eq(videoFormulas.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting formula:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
