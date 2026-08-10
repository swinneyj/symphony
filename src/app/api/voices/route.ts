import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { voices } from "@/db/schema";
import { eq, or, isNull, desc } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

/**
 * GET /api/voices?workspaceId=<id>
 * Lists system voices (workspaceId null) + the workspace's own.
 *
 * POST /api/voices
 * Body: { workspaceId, name, provider?, providerVoiceId?, isCloned?, sampleUrl? }
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
      .from(voices)
      .where(
        or(eq(voices.workspaceId, workspaceId), isNull(voices.workspaceId))
      )
      .orderBy(desc(voices.isCloned), desc(voices.createdAt));

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Error listing voices:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

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
      provider,
      providerVoiceId,
      isCloned,
      sampleUrl,
    } = body;

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Voice name is required" },
        { status: 400 }
      );
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [voice] = await db
      .insert(voices)
      .values({
        workspaceId,
        name: name.trim(),
        provider: provider || "openai_tts",
        providerVoiceId: providerVoiceId || null,
        isCloned: Boolean(isCloned),
        sampleUrl: sampleUrl || null,
      })
      .returning();

    return NextResponse.json(voice, { status: 201 });
  } catch (error) {
    console.error("Error creating voice:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
