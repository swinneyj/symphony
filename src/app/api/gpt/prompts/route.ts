import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workspaceMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withLLM } from "@/lib/llm";
import { getGptPreset } from "@/lib/video/gpt-presets";
import { generateBofHooks } from "@/lib/video/script-fill";
import { estimateChatCost, recordLlmUsage, type UsageContext } from "@/lib/usage";

/**
 * GPT Library runner — exposes the ported custom-GPT presets as an API:
 *
 *   POST /api/gpt/prompts
 *   { preset: "nano_banana" | "kling3", input: "...", context?: "..." }
 *     → { text }            (built prompt)
 *   { preset: "bof_hooks", productName: "...", price?: "..." }
 *     → { hooks: string[] } (10 BOF hooks, best-first)
 *
 * Used by the Image Studio / Clone prompt builders and any future preset UI.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [member] = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, session.user.id))
      .limit(1);
    if (!member) {
      return NextResponse.json({ error: "No workspace" }, { status: 403 });
    }
    const usageCtx: UsageContext = {
      workspaceId: member.workspaceId,
      createdById: session.user.id,
      surface: "gpt",
    };

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const presetId = typeof body.preset === "string" ? body.preset : "";

    if (presetId === "bof_hooks") {
      const name = typeof body.productName === "string" ? body.productName.trim() : "";
      if (!name) {
        return NextResponse.json({ error: "productName required" }, { status: 400 });
      }
      const hooks = await generateBofHooks(
        { name, description: null, price: typeof body.price === "string" ? body.price : null },
        usageCtx
      );
      return NextResponse.json({ hooks });
    }

    const preset = getGptPreset(presetId);
    if (!preset || (presetId !== "nano_banana" && presetId !== "kling3")) {
      return NextResponse.json(
        { error: "Unknown preset (nano_banana | kling3 | bof_hooks)" },
        { status: 400 }
      );
    }

    const input = typeof body.input === "string" ? body.input.trim() : "";
    if (!input) {
      return NextResponse.json({ error: "input required" }, { status: 400 });
    }
    const context = typeof body.context === "string" ? body.context.trim() : "";

    const messages: Array<{ role: "system" | "user"; content: string }> = [
      { role: "system", content: preset.systemPrompt },
      { role: "user", content: context ? `CONTEXT:\n${context}\n\nIDEA / REQUEST:\n${input}` : input },
    ];
    const estimate = estimateChatCost("gpt", messages, { maxOutputTokens: 900 });
    let usedModel = estimate.model;
    const res = await withLLM("gpt", (client, model) => {
      usedModel = model;
      return client.chat.completions.create({
        model,
        max_tokens: 900,
        temperature: 0.8,
        messages,
      });
    });
    if (!res) {
      return NextResponse.json({ error: "LLM chain unavailable" }, { status: 503 });
    }
    await recordLlmUsage(usageCtx, usedModel, res.usage, estimate);

    const text = res.choices[0]?.message?.content?.trim();
    if (!text) {
      return NextResponse.json({ error: "Empty model response" }, { status: 502 });
    }
    // Strip the "Prompt:" / "Kling 3 Prompt:" label the GPTs sometimes emit.
    const cleaned = text.replace(/^(Kling 3 Prompt|Prompt):\s*/i, "").trim();
    return NextResponse.json({ text: cleaned });
  } catch (error) {
    console.error("[gpt/prompts]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
