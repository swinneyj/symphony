import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { llmUsage } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { runFormulaAgent } from "@/lib/video/formula-agent";

/**
 * POST /api/formulas/agent
 * Body: { workspaceId, prompt, nodeGraph }
 * The Formula Studio agent rewires the node graph from a natural-language
 * prompt. Returns { nodes, edges, summary } ready to apply client-side.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const { workspaceId, prompt, nodeGraph } = body ?? {};
    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await runFormulaAgent(nodeGraph ?? { nodes: [], edges: [] }, prompt.trim(), {
      workspaceId,
      createdById: session.user.id,
      surface: "agent",
    });

    // Actual LLM usage for this agent call (recorded by the usage tracker).
    const [usage] = await db
      .select({
        model: llmUsage.model,
        provider: llmUsage.provider,
        inputTokens: llmUsage.inputTokens,
        outputTokens: llmUsage.outputTokens,
        cacheReadTokens: llmUsage.cacheReadTokens,
        costUsd: llmUsage.costUsd,
        estimatedCostUsd: llmUsage.estimatedCostUsd,
      })
      .from(llmUsage)
      .where(
        and(
          eq(llmUsage.surface, "agent"),
          eq(llmUsage.workspaceId, workspaceId),
          eq(llmUsage.createdById, session.user.id)
        )
      )
      .orderBy(desc(llmUsage.createdAt))
      .limit(1);

    return NextResponse.json({ ...result, usage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent failed";
    console.error("Formula agent error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
