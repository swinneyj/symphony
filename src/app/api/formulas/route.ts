import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { videoFormulas } from "@/db/schema";
import { eq, or, isNull, desc } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

/**
 * GET /api/formulas?workspaceId=<id>
 * Lists system formulas (workspaceId null) + the workspace's own, newest first.
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
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows = await db
      .select()
      .from(videoFormulas)
      .where(
        or(
          eq(videoFormulas.workspaceId, workspaceId),
          isNull(videoFormulas.workspaceId)
        )
      )
      .orderBy(desc(videoFormulas.isSystem), desc(videoFormulas.createdAt));

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Error listing formulas:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/formulas
 * Creates a custom formula for the workspace.
 * Body: { workspaceId, name, category?, scriptTemplate, scenePromptTemplate?,
 * motionPreset?, durationSec?, quality? }
 */
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
      category,
      scriptTemplate,
      scenePromptTemplate,
      motionPreset,
      durationSec,
      quality,
    } = body;

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Formula name is required" },
        { status: 400 }
      );
    }
    if (
      !scriptTemplate ||
      typeof scriptTemplate !== "string" ||
      scriptTemplate.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "scriptTemplate is required" },
        { status: 400 }
      );
    }

    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [formula] = await db
      .insert(videoFormulas)
      .values({
        workspaceId,
        name: name.trim(),
        category: category?.trim() || "generic",
        scriptTemplate: scriptTemplate.trim(),
        scenePromptTemplate: scenePromptTemplate?.trim() || null,
        motionPreset: motionPreset || "none",
        durationSec: Number(durationSec) || 6,
        quality: quality || "standard",
        isSystem: false,
      })
      .returning();

    return NextResponse.json(formula, { status: 201 });
  } catch (error) {
    console.error("Error creating formula:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
